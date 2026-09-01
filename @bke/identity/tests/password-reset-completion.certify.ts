import argon2 from "argon2";
import { Client } from "pg";
import { createArgon2PasswordHasher } from "../providers/argon2-password-hasher";
import { createHmacPasswordResetTokenProvider } from "../providers/hmac-password-reset-token-provider";
import { createIdentityPasswordResetCompletionCapability } from "../logic/password-reset-completion";
import { createPostgresIdentityPasswordResetCompletionRepository } from "../prisma/repositories/postgres-password-reset-completion-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Identity password-reset completion certification.");
}

const now = new Date("2026-08-31T06:15:00.000Z");
const sessionSecret = "identity-password-reset-completion-secret";
const rawToken = "abcdefghijklmnopqrstuvwxyz-RESET-TOKEN";
const oldPassword = "OldPassword123";
const newPassword = "NewPassword456";
const oldHash = await argon2.hash(oldPassword);
const tokenProvider = createHmacPasswordResetTokenProvider(sessionSecret);
const repository = createPostgresIdentityPasswordResetCompletionRepository(connectionString);
const capability = createIdentityPasswordResetCompletionCapability(
  repository,
  tokenProvider,
  createArgon2PasswordHasher(),
  () => now,
);
const client = new Client({ connectionString });
await client.connect();

try {
  await client.query(
    `INSERT INTO "User" ("id", "email", "name", "role", "updatedAt", "lifecycleState")
     VALUES ('reset-complete-admin', 'reset-complete@example.com', 'Reset Complete', 'ADMIN', $1, 'ACTIVE')`,
    [now],
  );
  await client.query(
    `INSERT INTO "PasswordCredential" ("userId", "passwordHash", "changedAt")
     VALUES ('reset-complete-admin', $1, $2)`,
    [oldHash, new Date(now.getTime() - 60_000)],
  );
  await client.query(
    `INSERT INTO "PasswordResetToken" ("id", "userId", "tokenHash", "expiresAt")
     VALUES ('reset-complete-token', 'reset-complete-admin', $1, $2)`,
    [tokenProvider.hash(rawToken), new Date(now.getTime() + 30 * 60_000)],
  );
  for (const id of ['reset-session-1', 'reset-session-2']) {
    await client.query(
      `INSERT INTO "Session" (
         "id", "tokenHash", "userId", "expiresAt", "lastAuthenticatedAt",
         "lastSeenAt", "absoluteExpiresAt", "authenticationMethod", "assuranceLevel"
       ) VALUES ($1, $2, 'reset-complete-admin', $3, $4, $4, $5, 'PASSWORD', 'BASIC')`,
      [
        id,
        `${id}-hash`,
        new Date(now.getTime() + 60 * 60_000),
        new Date(now.getTime() - 60_000),
        new Date(now.getTime() + 2 * 60 * 60_000),
      ],
    );
  }

  await client.query(`
    CREATE OR REPLACE FUNCTION identity_password_reset_cert_fail_revoke()
    RETURNS trigger AS $$
    BEGIN
      IF NEW."revocationReason" = 'PASSWORD_RESET' THEN
        RAISE EXCEPTION 'forced password reset session revocation failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await client.query(`
    CREATE TRIGGER identity_password_reset_cert_fail_revoke_trigger
    BEFORE UPDATE ON "Session"
    FOR EACH ROW EXECUTE FUNCTION identity_password_reset_cert_fail_revoke();
  `);

  const forcedFailure = await capability.complete({ token: rawToken, password: newPassword });
  if (forcedFailure.status !== "FAILED" || forcedFailure.code !== "PERSISTENCE_UNAVAILABLE") {
    throw new Error(`Forced password-reset failure did not fail closed: ${JSON.stringify(forcedFailure)}`);
  }

  const rollback = await client.query<{
    usedAt: Date | null;
    passwordHash: string;
    activeSessions: string;
  }>(
    `SELECT
       reset."usedAt" AS "usedAt",
       credential."passwordHash" AS "passwordHash",
       (SELECT COUNT(*)::text FROM "Session" s WHERE s."userId" = reset."userId" AND s."revokedAt" IS NULL) AS "activeSessions"
     FROM "PasswordResetToken" reset
     JOIN "PasswordCredential" credential ON credential."userId" = reset."userId"
     WHERE reset."id" = 'reset-complete-token'`,
  );
  const rolled = rollback.rows[0];
  if (!rolled || rolled.usedAt !== null || rolled.passwordHash !== oldHash || rolled.activeSessions !== "2") {
    throw new Error(`Password-reset transaction was not atomic: ${JSON.stringify(rolled)}`);
  }

  await client.query(`DROP TRIGGER identity_password_reset_cert_fail_revoke_trigger ON "Session"`);
  await client.query(`DROP FUNCTION identity_password_reset_cert_fail_revoke()`);

  const completed = await capability.complete({ token: rawToken, password: newPassword });
  if (
    completed.status !== "COMPLETED" ||
    completed.userId !== "reset-complete-admin" ||
    completed.role !== "ADMIN"
  ) {
    throw new Error(`Password-reset completion failed: ${JSON.stringify(completed)}`);
  }

  const finalState = await client.query<{
    usedAt: Date | null;
    passwordHash: string;
    activeSessions: string;
    resetRevokedSessions: string;
  }>(
    `SELECT
       reset."usedAt" AS "usedAt",
       credential."passwordHash" AS "passwordHash",
       (SELECT COUNT(*)::text FROM "Session" s WHERE s."userId" = reset."userId" AND s."revokedAt" IS NULL) AS "activeSessions",
       (SELECT COUNT(*)::text FROM "Session" s WHERE s."userId" = reset."userId" AND s."revocationReason" = 'PASSWORD_RESET') AS "resetRevokedSessions"
     FROM "PasswordResetToken" reset
     JOIN "PasswordCredential" credential ON credential."userId" = reset."userId"
     WHERE reset."id" = 'reset-complete-token'`,
  );
  const state = finalState.rows[0];
  if (
    !state?.usedAt ||
    state.activeSessions !== "0" ||
    state.resetRevokedSessions !== "2" ||
    !(await argon2.verify(state.passwordHash, newPassword)) ||
    (await argon2.verify(state.passwordHash, oldPassword))
  ) {
    throw new Error(`Password-reset final state mismatch: ${JSON.stringify(state)}`);
  }

  const replay = await capability.complete({ token: rawToken, password: "AnotherPassword789" });
  if (replay.status !== "INVALID" || replay.code !== "INVALID_TOKEN") {
    throw new Error(`Consumed password-reset token was replayable: ${JSON.stringify(replay)}`);
  }

  console.log("Identity password-reset completion certification GREEN");
} finally {
  await client.query(
    `DROP TRIGGER IF EXISTS identity_password_reset_cert_fail_revoke_trigger ON "Session"`,
  ).catch(() => undefined);
  await client.query(
    `DROP FUNCTION IF EXISTS identity_password_reset_cert_fail_revoke()`,
  ).catch(() => undefined);
  await client.end();
}

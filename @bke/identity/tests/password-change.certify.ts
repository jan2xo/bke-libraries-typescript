import { Client } from "pg";
import { createIdentityPasswordChangeCapability } from "../logic/password-change";
import { createArgon2PasswordHasher } from "../providers/argon2-password-hasher";
import { createArgon2PasswordVerifier } from "../providers/argon2-password-verifier";
import { createHmacSessionTokenProvider } from "../providers/hmac-session-token-provider";
import { createIdentitySessionIssuanceCapability } from "../logic/session-issuance";
import { createIdentitySessionValidationCapability } from "../logic/session-validation";
import { createPostgresIdentityPasswordChangeRepository } from "../prisma/repositories/postgres-password-change-repository";
import { createPostgresIdentitySessionRepository } from "../prisma/repositories/postgres-session-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Identity password change certification.");
}

const now = new Date("2026-09-01T08:20:00.000Z");
const sessionIssuedAt = new Date(now.getTime() - 5 * 60_000);
const staleSessionIssuedAt = new Date(now.getTime() - 16 * 60_000);
const sessionSecret = "identity-password-change-certification-secret";
const userId = "password-change-user";
const email = "password-change@example.com";
const staleUserId = "password-change-stale-user";
const oldPassword = "OldPassword123";
const newPassword = "NewPassword456";
const hasher = createArgon2PasswordHasher();
const verifier = createArgon2PasswordVerifier();
const sessionTokens = createHmacSessionTokenProvider(sessionSecret);
const sessionRepository = createPostgresIdentitySessionRepository(connectionString);
const sessionValidation = createIdentitySessionValidationCapability(
  sessionRepository,
  sessionTokens,
  () => now,
);
const passwordRepository =
  createPostgresIdentityPasswordChangeRepository(connectionString);
const client = new Client({ connectionString });
await client.connect();

async function createCustomer(id: string, address: string, password: string) {
  const passwordHash = await hasher.hash(password);
  await client.query(
    `INSERT INTO "User"
       ("id", "email", "name", "role", "updatedAt", "lifecycleState")
     VALUES ($1, $2, $3, 'CUSTOMER', $4, 'ACTIVE')`,
    [id, address, id, now],
  );
  await client.query(
    `INSERT INTO "PasswordCredential" ("userId", "passwordHash", "changedAt")
     VALUES ($1, $2, $3)`,
    [id, passwordHash, new Date(now.getTime() - 24 * 60 * 60_000)],
  );
  return passwordHash;
}

async function issueSession(id: string, issuedAt: Date) {
  const issuance = createIdentitySessionIssuanceCapability(
    sessionRepository,
    sessionTokens,
    () => issuedAt,
  );
  const result = await issuance.issue({
    userId: id,
    authenticationMethod: "PASSWORD",
  });
  if (result.status !== "ISSUED") {
    throw new Error(`Session issuance failed for ${id}: ${JSON.stringify(result)}`);
  }
  return result;
}

try {
  const originalHash = await createCustomer(userId, email, oldPassword);
  const currentSession = await issueSession(userId, sessionIssuedAt);
  const secondSession = await issueSession(userId, sessionIssuedAt);

  await createCustomer(
    staleUserId,
    "password-change-stale@example.com",
    oldPassword,
  );
  const staleSession = await issueSession(staleUserId, staleSessionIssuedAt);

  const capability = createIdentityPasswordChangeCapability(
    passwordRepository,
    sessionValidation,
    verifier,
    hasher,
    () => now,
  );

  const staleResult = await capability.change({
    sessionToken: staleSession.token,
    currentPassword: oldPassword,
    newPassword,
  });
  if (
    staleResult.status !== "INVALID" ||
    staleResult.code !== "RECENT_AUTH_REQUIRED"
  ) {
    throw new Error(
      `Stale recent-auth session was not rejected: ${JSON.stringify(staleResult)}`,
    );
  }
  const staleCredential = await client.query<{ passwordHash: string }>(
    `SELECT "passwordHash" FROM "PasswordCredential" WHERE "userId" = $1`,
    [staleUserId],
  );
  if (
    !staleCredential.rows[0] ||
    !(await verifier.verify(staleCredential.rows[0].passwordHash, oldPassword))
  ) {
    throw new Error("Stale recent-auth rejection unexpectedly changed credentials.");
  }

  await client.query(`
    CREATE FUNCTION "identity_fail_password_change_session_revoke"()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW."userId" = '${userId}'
         AND NEW."revocationReason" = 'PASSWORD_CHANGED' THEN
        RAISE EXCEPTION 'forced password change session revocation failure';
      END IF;
      RETURN NEW;
    END;
    $$
  `);
  await client.query(`
    CREATE TRIGGER "identity_fail_password_change_session_revoke_trigger"
    BEFORE UPDATE ON "Session"
    FOR EACH ROW
    EXECUTE FUNCTION "identity_fail_password_change_session_revoke"()
  `);

  const forcedFailure = await capability.change({
    sessionToken: currentSession.token,
    currentPassword: oldPassword,
    newPassword,
  });
  if (
    forcedFailure.status !== "FAILED" ||
    forcedFailure.code !== "PERSISTENCE_UNAVAILABLE"
  ) {
    throw new Error(
      `Forced password-change rollback was not typed: ${JSON.stringify(forcedFailure)}`,
    );
  }

  const rollbackCredential = await client.query<{
    passwordHash: string;
    changedAt: Date;
  }>(
    `SELECT "passwordHash", "changedAt"
       FROM "PasswordCredential"
      WHERE "userId" = $1`,
    [userId],
  );
  const rollbackSessions = await client.query<{
    id: string;
    revokedAt: Date | null;
    revocationReason: string | null;
  }>(
    `SELECT "id", "revokedAt", "revocationReason"
       FROM "Session"
      WHERE "userId" = $1
      ORDER BY "id"`,
    [userId],
  );
  const rollbackRow = rollbackCredential.rows[0];
  if (
    !rollbackRow ||
    rollbackRow.passwordHash !== originalHash ||
    !(await verifier.verify(rollbackRow.passwordHash, oldPassword)) ||
    (await verifier.verify(rollbackRow.passwordHash, newPassword)) ||
    rollbackSessions.rows.some((row) => row.revokedAt !== null)
  ) {
    throw new Error(
      "Password change did not roll credential and session revocation back together.",
    );
  }

  await client.query(
    `DROP TRIGGER "identity_fail_password_change_session_revoke_trigger" ON "Session"`,
  );
  await client.query(`DROP FUNCTION "identity_fail_password_change_session_revoke"()`);

  const changed = await capability.change({
    sessionToken: currentSession.token,
    currentPassword: oldPassword,
    newPassword,
  });
  if (
    changed.status !== "CHANGED" ||
    changed.userId !== userId ||
    changed.role !== "CUSTOMER" ||
    changed.replacementAuthenticationMethod !== "PASSWORD"
  ) {
    throw new Error(`Password change result mismatch: ${JSON.stringify(changed)}`);
  }

  const completedCredential = await client.query<{
    passwordHash: string;
    changedAt: Date;
  }>(
    `SELECT "passwordHash", "changedAt"
       FROM "PasswordCredential"
      WHERE "userId" = $1`,
    [userId],
  );
  const completedRow = completedCredential.rows[0];
  if (
    !completedRow ||
    completedRow.changedAt.getTime() !== now.getTime() ||
    !(await verifier.verify(completedRow.passwordHash, newPassword)) ||
    (await verifier.verify(completedRow.passwordHash, oldPassword))
  ) {
    throw new Error("Password change did not persist the new Argon2 password correctly.");
  }

  const revokedSessions = await client.query<{
    id: string;
    revokedAt: Date | null;
    revocationReason: string | null;
  }>(
    `SELECT "id", "revokedAt", "revocationReason"
       FROM "Session"
      WHERE "userId" = $1
      ORDER BY "id"`,
    [userId],
  );
  if (
    revokedSessions.rowCount !== 2 ||
    revokedSessions.rows.some(
      (row) =>
        row.revokedAt?.getTime() !== now.getTime() ||
        row.revocationReason !== "PASSWORD_CHANGED",
    )
  ) {
    throw new Error("Password change did not revoke every active session consistently.");
  }

  const oldSessionResult = await sessionValidation.validate(currentSession.token);
  if (
    oldSessionResult.status !== "INVALID" ||
    oldSessionResult.code !== "SESSION_REVOKED"
  ) {
    throw new Error(
      `Changed-password session was not revoked: ${JSON.stringify(oldSessionResult)}`,
    );
  }

  const secondSessionResult = await sessionValidation.validate(secondSession.token);
  if (
    secondSessionResult.status !== "INVALID" ||
    secondSessionResult.code !== "SESSION_REVOKED"
  ) {
    throw new Error(
      `Secondary session survived password change: ${JSON.stringify(secondSessionResult)}`,
    );
  }

  console.log("Identity password change certification GREEN");
} finally {
  await client
    .query(
      `DROP TRIGGER IF EXISTS "identity_fail_password_change_session_revoke_trigger" ON "Session"`,
    )
    .catch(() => undefined);
  await client
    .query(`DROP FUNCTION IF EXISTS "identity_fail_password_change_session_revoke"()`)
    .catch(() => undefined);
  await client.end();
}

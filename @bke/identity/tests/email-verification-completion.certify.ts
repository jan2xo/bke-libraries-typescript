import { Client } from "pg";
import { createIdentityEmailVerificationCompletionCapability } from "../logic/email-verification-completion";
import { createHmacEmailVerificationTokenProvider } from "../providers/hmac-email-verification-token-provider";
import { createPostgresIdentityEmailVerificationCompletionRepository } from "../prisma/repositories/postgres-email-verification-completion-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is required for Identity email verification completion certification.",
  );
}

const now = new Date("2026-09-01T07:40:00.000Z");
const sessionSecret = "identity-email-verification-completion-secret";
const targetUserId = "email-verify-complete-user";
const targetEmail = "email-verify-complete@example.com";
const validToken = "email-verify-complete-valid-token";
const wrongPurposeToken = "email-verify-complete-wrong-purpose-token";
const usedToken = "email-verify-complete-used-token";
const expiredToken = "email-verify-complete-expired-token";
const missingUserToken = "email-verify-complete-missing-user-token";
const client = new Client({ connectionString });
await client.connect();

try {
  const tokenProvider = createHmacEmailVerificationTokenProvider(sessionSecret);

  await client.query(
    `INSERT INTO "User"
       ("id", "email", "name", "role", "updatedAt", "lifecycleState", "emailVerified")
     VALUES ($1, $2, 'Verification Completion Target', 'CUSTOMER', $3, 'ACTIVE', NULL)`,
    [targetUserId, targetEmail, now],
  );

  await client.query(
    `INSERT INTO "VerificationToken"
       ("id", "identifier", "purpose", "tokenHash", "expiresAt", "usedAt")
     VALUES
       ('email-verify-complete-valid', $1, 'VERIFY_EMAIL', $2, $7, NULL),
       ('email-verify-complete-wrong-purpose', $1, 'MAGIC_LOGIN', $3, $8, NULL),
       ('email-verify-complete-used', $1, 'VERIFY_EMAIL', $4, $8, $6),
       ('email-verify-complete-expired', $1, 'VERIFY_EMAIL', $5, $9, NULL),
       ('email-verify-complete-missing-user', 'email-verify-complete-missing@example.com', 'VERIFY_EMAIL', $10, $8, NULL)`,
    [
      targetEmail,
      tokenProvider.hash(validToken),
      tokenProvider.hash(wrongPurposeToken),
      tokenProvider.hash(usedToken),
      tokenProvider.hash(expiredToken),
      new Date(now.getTime() - 60_000),
      now,
      new Date(now.getTime() + 30 * 60_000),
      new Date(now.getTime() - 1),
      tokenProvider.hash(missingUserToken),
    ],
  );

  const capability = createIdentityEmailVerificationCompletionCapability(
    createPostgresIdentityEmailVerificationCompletionRepository(connectionString),
    tokenProvider,
    () => now,
  );

  await client.query(`
    CREATE FUNCTION "identity_fail_email_verification_user_update"()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW."id" = '${targetUserId}' AND NEW."emailVerified" IS NOT NULL THEN
        RAISE EXCEPTION 'forced email verification user update failure';
      END IF;
      RETURN NEW;
    END;
    $$
  `);
  await client.query(`
    CREATE TRIGGER "identity_fail_email_verification_user_update_trigger"
    BEFORE UPDATE ON "User"
    FOR EACH ROW
    EXECUTE FUNCTION "identity_fail_email_verification_user_update"()
  `);

  const forcedFailure = await capability.complete({ token: validToken });
  if (
    forcedFailure.status !== "FAILED" ||
    forcedFailure.code !== "PERSISTENCE_UNAVAILABLE"
  ) {
    throw new Error(
      `Forced email verification completion failure was not typed: ${JSON.stringify(forcedFailure)}`,
    );
  }

  const rollbackToken = await client.query<{ usedAt: Date | null }>(
    `SELECT "usedAt" FROM "VerificationToken" WHERE "id" = 'email-verify-complete-valid'`,
  );
  const rollbackUser = await client.query<{ emailVerified: Date | null }>(
    `SELECT "emailVerified" FROM "User" WHERE "id" = $1`,
    [targetUserId],
  );
  if (
    rollbackToken.rows[0]?.usedAt !== null ||
    rollbackUser.rows[0]?.emailVerified !== null
  ) {
    throw new Error(
      "Email verification completion did not roll back token consumption and user verification together.",
    );
  }

  await client.query(
    `DROP TRIGGER "identity_fail_email_verification_user_update_trigger" ON "User"`,
  );
  await client.query(`DROP FUNCTION "identity_fail_email_verification_user_update"()`);

  for (const token of [wrongPurposeToken, usedToken, expiredToken]) {
    const rejected = await capability.complete({ token });
    if (rejected.status !== "REJECTED" || rejected.code !== "INVALID_TOKEN") {
      throw new Error(
        `Invalid email verification proof was not rejected uniformly: ${JSON.stringify(rejected)}`,
      );
    }
  }

  const invalidState = await client.query<{
    id: string;
    usedAt: Date | null;
  }>(
    `SELECT "id", "usedAt"
       FROM "VerificationToken"
      WHERE "id" IN (
        'email-verify-complete-wrong-purpose',
        'email-verify-complete-used',
        'email-verify-complete-expired'
      )
      ORDER BY "id"`,
  );
  const wrongPurpose = invalidState.rows.find(
    (row) => row.id === "email-verify-complete-wrong-purpose",
  );
  const used = invalidState.rows.find(
    (row) => row.id === "email-verify-complete-used",
  );
  const expired = invalidState.rows.find(
    (row) => row.id === "email-verify-complete-expired",
  );
  if (
    wrongPurpose?.usedAt !== null ||
    used?.usedAt === null ||
    expired?.usedAt !== null
  ) {
    throw new Error(
      "Rejected email verification proofs were unexpectedly consumed or altered.",
    );
  }

  const missingUser = await capability.complete({ token: missingUserToken });
  if (
    missingUser.status !== "FAILED" ||
    missingUser.code !== "PERSISTENCE_UNAVAILABLE"
  ) {
    throw new Error(
      `Missing-principal verification token did not preserve V1 transactional failure semantics: ${JSON.stringify(missingUser)}`,
    );
  }
  const missingUserRow = await client.query<{ usedAt: Date | null }>(
    `SELECT "usedAt" FROM "VerificationToken" WHERE "id" = 'email-verify-complete-missing-user'`,
  );
  if (missingUserRow.rows[0]?.usedAt !== null) {
    throw new Error(
      "Missing-principal verification failure consumed the verification token.",
    );
  }

  const success = await capability.complete({ token: validToken });
  if (
    success.status !== "VERIFIED" ||
    success.userId !== targetUserId ||
    success.email !== targetEmail ||
    success.verifiedAt.getTime() !== now.getTime()
  ) {
    throw new Error(
      `Valid email verification proof did not complete: ${JSON.stringify(success)}`,
    );
  }

  const completedToken = await client.query<{ usedAt: Date | null }>(
    `SELECT "usedAt" FROM "VerificationToken" WHERE "id" = 'email-verify-complete-valid'`,
  );
  const completedUser = await client.query<{
    emailVerified: Date | null;
    updatedAt: Date;
  }>(
    `SELECT "emailVerified", "updatedAt" FROM "User" WHERE "id" = $1`,
    [targetUserId],
  );
  if (
    completedToken.rows[0]?.usedAt?.getTime() !== now.getTime() ||
    completedUser.rows[0]?.emailVerified?.getTime() !== now.getTime() ||
    completedUser.rows[0]?.updatedAt.getTime() !== now.getTime()
  ) {
    throw new Error(
      "Email verification completion did not persist one consistent completion timestamp.",
    );
  }

  const replay = await capability.complete({ token: validToken });
  if (replay.status !== "REJECTED" || replay.code !== "INVALID_TOKEN") {
    throw new Error(
      `Consumed email verification proof replay was not rejected: ${JSON.stringify(replay)}`,
    );
  }

  console.log("Identity email verification completion certification GREEN");
} finally {
  await client
    .query(
      `DROP TRIGGER IF EXISTS "identity_fail_email_verification_user_update_trigger" ON "User"`,
    )
    .catch(() => undefined);
  await client
    .query(`DROP FUNCTION IF EXISTS "identity_fail_email_verification_user_update"()`)
    .catch(() => undefined);
  await client.end();
}

import { createHmac } from "node:crypto";
import { Client } from "pg";
import { createIdentityMagicLoginConsumeCapability } from "../logic/magic-login-consume";
import { createHmacMagicLoginTokenProvider } from "../providers/hmac-magic-login-token-provider";
import { createHmacSessionTokenProvider } from "../providers/hmac-session-token-provider";
import { createPostgresIdentityMagicLoginConsumeRepository } from "../prisma/repositories/postgres-magic-login-consume-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Identity magic-login consume certification.");
}

const now = new Date("2026-08-31T14:45:00.000Z");
const sessionSecret = "identity-magic-login-consume-secret";
const client = new Client({ connectionString });
await client.connect();

const hmac = (value: string) =>
  createHmac("sha256", sessionSecret).update(value).digest("hex");

const validToken = "magic-valid-token-abcdefghijklmnopqrstuvwxyz";
const adminToken = "magic-admin-token-abcdefghijklmnopqrstuvwxyz";
const inactiveToken = "magic-inactive-token-abcdefghijklmnopqrstuv";
const wrongPurposeToken = "magic-wrong-purpose-abcdefghijklmnopqrstuvwxyz";
const usedToken = "magic-used-token-abcdefghijklmnopqrstuvwxyz";
const expiredToken = "magic-expired-token-abcdefghijklmnopqrstuvwxyz";
const missingUserToken = "magic-missing-user-abcdefghijklmnopqrstuvwxyz";

try {
  await client.query(
    `INSERT INTO "User" ("id", "email", "name", "role", "updatedAt", "lifecycleState", "suspendedAt")
     VALUES
       ('magic-consume-active', 'magic-consume-active@example.com', 'Active Customer', 'CUSTOMER', $1, 'ACTIVE', NULL),
       ('magic-consume-admin', 'magic-consume-admin@example.com', 'Admin', 'ADMIN', $1, 'ACTIVE', NULL),
       ('magic-consume-inactive', 'magic-consume-inactive@example.com', 'Inactive Customer', 'CUSTOMER', $1, 'SUSPENDED', $1)`,
    [now],
  );

  await client.query(
    `INSERT INTO "VerificationToken"
       ("id", "identifier", "purpose", "tokenHash", "expiresAt", "usedAt")
     VALUES
       ('magic-consume-valid', 'magic-consume-active@example.com', 'MAGIC_LOGIN', $1, $8, NULL),
       ('magic-consume-admin-token', 'magic-consume-admin@example.com', 'MAGIC_LOGIN', $2, $8, NULL),
       ('magic-consume-inactive-token', 'magic-consume-inactive@example.com', 'MAGIC_LOGIN', $3, $8, NULL),
       ('magic-consume-wrong-purpose', 'magic-consume-active@example.com', 'VERIFY_EMAIL', $4, $8, NULL),
       ('magic-consume-used', 'magic-consume-active@example.com', 'MAGIC_LOGIN', $5, $8, $7),
       ('magic-consume-expired', 'magic-consume-active@example.com', 'MAGIC_LOGIN', $6, $9, NULL),
       ('magic-consume-missing-user', 'magic-consume-missing@example.com', 'MAGIC_LOGIN', $10, $8, NULL)`,
    [
      hmac(validToken),
      hmac(adminToken),
      hmac(inactiveToken),
      hmac(wrongPurposeToken),
      hmac(usedToken),
      hmac(expiredToken),
      new Date(now.getTime() - 60_000),
      new Date(now.getTime() + 15 * 60_000),
      new Date(now.getTime() - 1),
      hmac(missingUserToken),
    ],
  );

  const capability = createIdentityMagicLoginConsumeCapability(
    createPostgresIdentityMagicLoginConsumeRepository(connectionString),
    createHmacMagicLoginTokenProvider(sessionSecret),
    createHmacSessionTokenProvider(sessionSecret),
    () => now,
  );

  await client.query(`
    CREATE FUNCTION "identity_fail_magic_consume_session_insert"()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW."userId" = 'magic-consume-active' AND NEW."authenticationMethod" = 'MAGIC_LINK' THEN
        RAISE EXCEPTION 'forced magic session insert failure';
      END IF;
      RETURN NEW;
    END;
    $$
  `);
  await client.query(`
    CREATE TRIGGER "identity_fail_magic_consume_session_insert_trigger"
    BEFORE INSERT ON "Session"
    FOR EACH ROW
    EXECUTE FUNCTION "identity_fail_magic_consume_session_insert"()
  `);

  const forcedFailure = await capability.consume({ token: validToken });
  if (
    forcedFailure.status !== "FAILED" ||
    forcedFailure.code !== "PERSISTENCE_UNAVAILABLE"
  ) {
    throw new Error(`Forced magic-login session failure was not typed: ${JSON.stringify(forcedFailure)}`);
  }

  const rollbackToken = await client.query<{ usedAt: Date | null }>(
    `SELECT "usedAt" FROM "VerificationToken" WHERE "id" = 'magic-consume-valid'`,
  );
  const rollbackSessions = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS "count" FROM "Session" WHERE "userId" = 'magic-consume-active'`,
  );
  if (rollbackToken.rows[0]?.usedAt !== null || rollbackSessions.rows[0]?.count !== "0") {
    throw new Error("Magic-login consume did not roll back token consumption when session insertion failed.");
  }

  await client.query(`DROP TRIGGER "identity_fail_magic_consume_session_insert_trigger" ON "Session"`);
  await client.query(`DROP FUNCTION "identity_fail_magic_consume_session_insert"()`);

  const admin = await capability.consume({ token: adminToken });
  if (
    admin.status !== "REJECTED" ||
    admin.code !== "ADMIN_PASSWORD_REQUIRED" ||
    admin.userId !== "magic-consume-admin"
  ) {
    throw new Error(`Administrator magic-login block mismatch: ${JSON.stringify(admin)}`);
  }

  const inactive = await capability.consume({ token: inactiveToken });
  if (
    inactive.status !== "REJECTED" ||
    inactive.code !== "ACCOUNT_NOT_ACTIVE" ||
    inactive.userId !== "magic-consume-inactive"
  ) {
    throw new Error(`Inactive-customer magic-login result mismatch: ${JSON.stringify(inactive)}`);
  }

  for (const token of [wrongPurposeToken, usedToken, expiredToken, missingUserToken]) {
    const rejected = await capability.consume({ token });
    if (rejected.status !== "REJECTED" || rejected.code !== "INVALID_TOKEN") {
      throw new Error(`Invalid magic-login proof was not rejected uniformly: ${JSON.stringify(rejected)}`);
    }
  }

  const untouched = await client.query<{ id: string; usedAt: Date | null }>(
    `SELECT "id", "usedAt"
       FROM "VerificationToken"
      WHERE "id" IN ('magic-consume-admin-token', 'magic-consume-inactive-token', 'magic-consume-wrong-purpose', 'magic-consume-expired', 'magic-consume-missing-user')
      ORDER BY "id"`,
  );
  if (untouched.rows.some((row) => row.usedAt !== null)) {
    throw new Error("Rejected magic-login proofs were unexpectedly consumed.");
  }

  const success = await capability.consume({
    token: validToken,
    userAgentSummary: "Certification Browser",
    networkHint: "certification-network",
  });
  if (success.status !== "AUTHENTICATED") {
    throw new Error(`Valid magic-login proof did not authenticate: ${JSON.stringify(success)}`);
  }
  if (success.userId !== "magic-consume-active" || success.role !== "CUSTOMER") {
    throw new Error("Magic-login success returned the wrong principal identity.");
  }
  if (
    success.session.authenticationMethod !== "MAGIC_LINK" ||
    success.session.assuranceLevel !== "BASIC" ||
    success.session.mfaVerifiedAt !== null ||
    success.session.recentAuthenticatedAt !== null
  ) {
    throw new Error("Magic-login session assurance semantics do not match V1/V2 policy.");
  }
  if (
    success.session.expiresAt.getTime() !== now.getTime() + 14 * 24 * 60 * 60_000 ||
    success.session.absoluteExpiresAt.getTime() !== success.session.expiresAt.getTime()
  ) {
    throw new Error("Magic-login session lifetime is not exactly 14 days.");
  }

  const consumed = await client.query<{ usedAt: Date | null }>(
    `SELECT "usedAt" FROM "VerificationToken" WHERE "id" = 'magic-consume-valid'`,
  );
  if (!consumed.rows[0]?.usedAt || consumed.rows[0].usedAt.getTime() !== now.getTime()) {
    throw new Error("Successful magic-login proof was not consumed at the authentication time.");
  }

  const storedSession = await client.query<{
    tokenHash: string;
    userId: string;
    authenticationMethod: string;
    assuranceLevel: string;
    userAgentSummary: string | null;
    networkHint: string | null;
  }>(
    `SELECT "tokenHash", "userId", "authenticationMethod", "assuranceLevel", "userAgentSummary", "networkHint"
       FROM "Session"
      WHERE "id" = $1`,
    [success.session.id],
  );
  const row = storedSession.rows[0];
  if (!row) {
    throw new Error("Magic-login session was not persisted.");
  }
  const expectedSessionHash = hmac(success.token);
  if (row.tokenHash !== expectedSessionHash || row.tokenHash === success.token) {
    throw new Error("Magic-login session persistence did not keep the raw session token outside PostgreSQL.");
  }
  if (
    row.userId !== "magic-consume-active" ||
    row.authenticationMethod !== "MAGIC_LINK" ||
    row.assuranceLevel !== "BASIC" ||
    row.userAgentSummary !== "Certification Browser" ||
    row.networkHint !== "certification-network"
  ) {
    throw new Error("Persisted magic-login session context mismatch.");
  }

  const replay = await capability.consume({ token: validToken });
  if (replay.status !== "REJECTED" || replay.code !== "INVALID_TOKEN") {
    throw new Error(`Consumed magic-login proof replay was not rejected: ${JSON.stringify(replay)}`);
  }
  const finalSessions = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS "count" FROM "Session" WHERE "userId" = 'magic-consume-active'`,
  );
  if (finalSessions.rows[0]?.count !== "1") {
    throw new Error(`Magic-login replay created an extra session: ${finalSessions.rows[0]?.count}`);
  }

  console.log("Identity magic-login consume certification GREEN");
} finally {
  await client.query(`DROP TRIGGER IF EXISTS "identity_fail_magic_consume_session_insert_trigger" ON "Session"`).catch(() => undefined);
  await client.query(`DROP FUNCTION IF EXISTS "identity_fail_magic_consume_session_insert"()`).catch(() => undefined);
  await client.end();
}

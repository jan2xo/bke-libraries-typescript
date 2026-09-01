import { createHmac } from "node:crypto";
import { Client } from "pg";
import { createIdentityMagicLoginRequestCapability } from "../logic/magic-login-request";
import { createHmacMagicLoginTokenProvider } from "../providers/hmac-magic-login-token-provider";
import { createPostgresIdentityMagicLoginRequestRepository } from "../prisma/repositories/postgres-magic-login-request-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Identity magic-login request certification.");
}

const now = new Date("2026-08-31T14:15:00.000Z");
const sessionSecret = "identity-magic-login-request-secret";
const client = new Client({ connectionString });
await client.connect();

try {
  await client.query(
    `INSERT INTO "User" ("id", "email", "name", "role", "updatedAt", "lifecycleState")
     VALUES
       ('magic-user', 'magic@example.com', 'Magic User', 'CUSTOMER', $1, 'ACTIVE'),
       ('magic-admin', 'admin@example.com', 'Magic Admin', 'ADMIN', $1, 'ACTIVE')`,
    [now],
  );
  await client.query(
    `INSERT INTO "VerificationToken"
       ("id", "identifier", "purpose", "tokenHash", "expiresAt", "usedAt")
     VALUES
       ('existing-magic', 'magic@example.com', 'MAGIC_LOGIN', 'existing-magic-hash', $1, NULL),
       ('verify-email-token', 'magic@example.com', 'VERIFY_EMAIL', 'verify-email-hash', $1, NULL)`,
    [new Date(now.getTime() + 5 * 60_000)],
  );

  const capability = createIdentityMagicLoginRequestCapability(
    createPostgresIdentityMagicLoginRequestRepository(connectionString),
    createHmacMagicLoginTokenProvider(sessionSecret),
    () => now,
  );

  await client.query(`
    CREATE FUNCTION "identity_fail_magic_login_insert"()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW."purpose" = 'MAGIC_LOGIN' AND NEW."identifier" = 'magic@example.com' THEN
        RAISE EXCEPTION 'forced magic-login insert failure';
      END IF;
      RETURN NEW;
    END;
    $$
  `);
  await client.query(`
    CREATE TRIGGER "identity_fail_magic_login_insert_trigger"
    BEFORE INSERT ON "VerificationToken"
    FOR EACH ROW
    EXECUTE FUNCTION "identity_fail_magic_login_insert"()
  `);

  const failed = await capability.request({ email: "magic@example.com" });
  if (failed.status !== "FAILED" || failed.code !== "PERSISTENCE_UNAVAILABLE") {
    throw new Error(`Forced magic-login replacement failure was not typed: ${JSON.stringify(failed)}`);
  }
  const afterFailure = await client.query<{ usedAt: Date | null; count: string }>(
    `SELECT
       MAX("usedAt") FILTER (WHERE "id" = 'existing-magic') AS "usedAt",
       COUNT(*)::text AS "count"
     FROM "VerificationToken"
     WHERE "identifier" = 'magic@example.com'`,
  );
  if (afterFailure.rows[0]?.usedAt !== null || afterFailure.rows[0]?.count !== "2") {
    throw new Error("Failed magic-login replacement did not roll back prior-token mutation atomically.");
  }

  await client.query(`DROP TRIGGER "identity_fail_magic_login_insert_trigger" ON "VerificationToken"`);
  await client.query(`DROP FUNCTION "identity_fail_magic_login_insert"()`);

  const result = await capability.request({ email: " MAGIC@EXAMPLE.COM " });
  if (result.status !== "ACCEPTED" || !result.delivery) {
    throw new Error(`Magic-login request did not issue delivery material: ${JSON.stringify(result)}`);
  }
  if (result.delivery.recipientEmail !== "magic@example.com") {
    throw new Error(`Magic-login recipient was not normalized: ${result.delivery.recipientEmail}`);
  }

  const magicRows = await client.query<{
    id: string;
    tokenHash: string;
    expiresAt: Date;
    usedAt: Date | null;
  }>(
    `SELECT "id", "tokenHash", "expiresAt", "usedAt"
       FROM "VerificationToken"
      WHERE "identifier" = 'magic@example.com'
        AND "purpose" = 'MAGIC_LOGIN'
      ORDER BY "id"`,
  );
  if (magicRows.rowCount !== 2) {
    throw new Error(`Expected old + new MAGIC_LOGIN rows; found ${magicRows.rowCount}`);
  }
  const oldRow = magicRows.rows.find((row) => row.id === "existing-magic");
  const created = magicRows.rows.find((row) => row.id !== "existing-magic");
  if (!oldRow || !created) {
    throw new Error("Magic-login replacement rows are incomplete.");
  }
  if (!oldRow.usedAt || oldRow.usedAt.getTime() !== now.getTime()) {
    throw new Error("Prior pending MAGIC_LOGIN token was not invalidated at issuance time.");
  }
  if (created.usedAt !== null) {
    throw new Error("New MAGIC_LOGIN token was unexpectedly created as used.");
  }
  const expectedHash = createHmac("sha256", sessionSecret)
    .update(result.delivery.token)
    .digest("hex");
  if (created.tokenHash !== expectedHash || created.tokenHash === result.delivery.token) {
    throw new Error("Magic-login persistence did not store only the token HMAC.");
  }
  if (created.expiresAt.getTime() !== now.getTime() + 15 * 60_000) {
    throw new Error(`Magic-login TTL mismatch: ${created.expiresAt.toISOString()}`);
  }

  const purposeIsolation = await client.query<{ usedAt: Date | null }>(
    `SELECT "usedAt"
       FROM "VerificationToken"
      WHERE "id" = 'verify-email-token'`,
  );
  if (purposeIsolation.rows[0]?.usedAt !== null) {
    throw new Error("MAGIC_LOGIN replacement mutated a different verification-token purpose.");
  }

  const pending = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS "count"
       FROM "VerificationToken"
      WHERE "identifier" = 'magic@example.com'
        AND "purpose" = 'MAGIC_LOGIN'
        AND "usedAt" IS NULL`,
  );
  if (pending.rows[0]?.count !== "1") {
    throw new Error(`Expected exactly one pending MAGIC_LOGIN token; found ${pending.rows[0]?.count}`);
  }

  const beforeIneligible = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS "count" FROM "VerificationToken"`,
  );
  const admin = await capability.request({ email: "admin@example.com" });
  const missing = await capability.request({ email: "missing@example.com" });
  const afterIneligible = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS "count" FROM "VerificationToken"`,
  );
  if (
    admin.status !== "ACCEPTED" ||
    admin.delivery !== null ||
    missing.status !== "ACCEPTED" ||
    missing.delivery !== null ||
    beforeIneligible.rows[0]?.count !== afterIneligible.rows[0]?.count
  ) {
    throw new Error("Admin/missing magic-login request leaked eligibility or mutated persistence.");
  }

  console.log("Identity magic-login request certification GREEN");
} finally {
  await client.query(`DROP TRIGGER IF EXISTS "identity_fail_magic_login_insert_trigger" ON "VerificationToken"`);
  await client.query(`DROP FUNCTION IF EXISTS "identity_fail_magic_login_insert"()`);
  await client.end();
}

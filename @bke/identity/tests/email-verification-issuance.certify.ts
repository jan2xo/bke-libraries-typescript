import { createHmac } from "node:crypto";
import { Client } from "pg";
import { createIdentityEmailVerificationIssuanceCapability } from "../logic/email-verification-issuance";
import { createHmacEmailVerificationTokenProvider } from "../providers/hmac-email-verification-token-provider";
import { createPostgresIdentityEmailVerificationIssuanceRepository } from "../prisma/repositories/postgres-email-verification-issuance-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is required for Identity email verification issuance certification.",
  );
}

const now = new Date("2026-09-01T07:10:00.000Z");
const sessionSecret = "identity-email-verification-issuance-secret";
const targetUserId = "email-verify-issue-user";
const targetEmail = "email-verify-issue@example.com";
const verifiedUserId = "email-verify-already-user";
const verifiedEmail = "email-verify-already@example.com";
const client = new Client({ connectionString });
await client.connect();

const hmac = (value: string) =>
  createHmac("sha256", sessionSecret).update(value).digest("hex");

try {
  await client.query(
    `INSERT INTO "User"
       ("id", "email", "name", "role", "updatedAt", "lifecycleState", "emailVerified")
     VALUES
       ($1, $2, 'Verification Target', 'CUSTOMER', $5, 'ACTIVE', NULL),
       ($3, $4, 'Already Verified', 'CUSTOMER', $5, 'ACTIVE', $6)`,
    [
      targetUserId,
      targetEmail,
      verifiedUserId,
      verifiedEmail,
      now,
      new Date(now.getTime() - 24 * 60 * 60_000),
    ],
  );

  await client.query(
    `INSERT INTO "VerificationToken"
       ("id", "identifier", "purpose", "tokenHash", "expiresAt", "usedAt")
     VALUES
       ('email-verify-old-pending', $1, 'VERIFY_EMAIL', 'old-pending-hash', $3, NULL),
       ('email-verify-old-used', $1, 'VERIFY_EMAIL', 'old-used-hash', $3, $2),
       ('email-verify-magic-pending', $1, 'MAGIC_LOGIN', 'magic-pending-hash', $3, NULL)`,
    [
      targetEmail,
      new Date(now.getTime() - 60_000),
      new Date(now.getTime() + 15 * 60_000),
    ],
  );

  const tokenProvider = createHmacEmailVerificationTokenProvider(sessionSecret);
  const capability = createIdentityEmailVerificationIssuanceCapability(
    createPostgresIdentityEmailVerificationIssuanceRepository(connectionString),
    tokenProvider,
    () => now,
  );

  await client.query(`
    CREATE FUNCTION "identity_fail_email_verification_insert"()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW."purpose" = 'VERIFY_EMAIL'
         AND NEW."identifier" = '${targetEmail}' THEN
        RAISE EXCEPTION 'forced email verification insert failure';
      END IF;
      RETURN NEW;
    END;
    $$
  `);
  await client.query(`
    CREATE TRIGGER "identity_fail_email_verification_insert_trigger"
    BEFORE INSERT ON "VerificationToken"
    FOR EACH ROW
    EXECUTE FUNCTION "identity_fail_email_verification_insert"()
  `);

  const forcedFailure = await capability.issue({ userId: targetUserId });
  if (
    forcedFailure.status !== "FAILED" ||
    forcedFailure.code !== "PERSISTENCE_UNAVAILABLE"
  ) {
    throw new Error(
      `Forced verification replacement failure was not typed: ${JSON.stringify(forcedFailure)}`,
    );
  }

  const rollbackRows = await client.query<{ id: string }>(
    `SELECT "id"
       FROM "VerificationToken"
      WHERE "identifier" = $1
      ORDER BY "id"`,
    [targetEmail],
  );
  const rollbackIds = rollbackRows.rows.map((row) => row.id);
  for (const expected of [
    "email-verify-old-pending",
    "email-verify-old-used",
    "email-verify-magic-pending",
  ]) {
    if (!rollbackIds.includes(expected)) {
      throw new Error(
        `Verification replacement rollback lost existing token ${expected}.`,
      );
    }
  }

  await client.query(
    `DROP TRIGGER "identity_fail_email_verification_insert_trigger" ON "VerificationToken"`,
  );
  await client.query(`DROP FUNCTION "identity_fail_email_verification_insert"()`);

  const issued = await capability.issue({ userId: `  ${targetUserId}  ` });
  if (issued.status !== "ISSUED") {
    throw new Error(
      `Email verification token was not issued: ${JSON.stringify(issued)}`,
    );
  }
  if (
    issued.userId !== targetUserId ||
    issued.delivery.recipientEmail !== targetEmail
  ) {
    throw new Error("Email verification delivery targeted the wrong principal.");
  }

  const expectedHash = hmac(issued.delivery.token);
  const pendingVerify = await client.query<{
    id: string;
    tokenHash: string;
    expiresAt: Date;
    usedAt: Date | null;
  }>(
    `SELECT "id", "tokenHash", "expiresAt", "usedAt"
       FROM "VerificationToken"
      WHERE "identifier" = $1
        AND "purpose" = 'VERIFY_EMAIL'
        AND "usedAt" IS NULL`,
    [targetEmail],
  );
  if (pendingVerify.rowCount !== 1) {
    throw new Error(
      `Expected exactly one pending VERIFY_EMAIL token, found ${pendingVerify.rowCount}.`,
    );
  }
  const pending = pendingVerify.rows[0];
  if (!pending) {
    throw new Error("Replacement VERIFY_EMAIL token was not persisted.");
  }
  if (
    pending.tokenHash !== expectedHash ||
    pending.tokenHash === issued.delivery.token
  ) {
    throw new Error(
      "Email verification persistence did not keep the raw token outside PostgreSQL.",
    );
  }
  if (pending.expiresAt.getTime() !== now.getTime() + 30 * 60_000) {
    throw new Error("Email verification token TTL is not exactly 30 minutes.");
  }
  if (pending.id === "email-verify-old-pending") {
    throw new Error("Pending VERIFY_EMAIL token was not replaced.");
  }

  const preserved = await client.query<{
    id: string;
    purpose: string;
    usedAt: Date | null;
  }>(
    `SELECT "id", "purpose", "usedAt"
       FROM "VerificationToken"
      WHERE "id" IN ('email-verify-old-used', 'email-verify-magic-pending')
      ORDER BY "id"`,
  );
  if (preserved.rowCount !== 2) {
    throw new Error("Verification replacement removed unrelated token history/state.");
  }
  const magic = preserved.rows.find(
    (row) => row.id === "email-verify-magic-pending",
  );
  const used = preserved.rows.find((row) => row.id === "email-verify-old-used");
  if (
    magic?.purpose !== "MAGIC_LOGIN" ||
    magic.usedAt !== null ||
    used?.purpose !== "VERIFY_EMAIL" ||
    used.usedAt === null
  ) {
    throw new Error(
      "Verification issuance failed purpose isolation or altered used token history.",
    );
  }

  const beforeAlreadyVerified = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS "count" FROM "VerificationToken"`,
  );
  const alreadyVerified = await capability.issue({ userId: verifiedUserId });
  const afterAlreadyVerified = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS "count" FROM "VerificationToken"`,
  );
  if (
    alreadyVerified.status !== "ALREADY_VERIFIED" ||
    alreadyVerified.userId !== verifiedUserId ||
    alreadyVerified.email !== verifiedEmail
  ) {
    throw new Error(
      `Already-verified result mismatch: ${JSON.stringify(alreadyVerified)}`,
    );
  }
  if (
    beforeAlreadyVerified.rows[0]?.count !==
    afterAlreadyVerified.rows[0]?.count
  ) {
    throw new Error("Already-verified issuance unexpectedly mutated token persistence.");
  }

  console.log("Identity email verification issuance certification GREEN");
} finally {
  await client
    .query(
      `DROP TRIGGER IF EXISTS "identity_fail_email_verification_insert_trigger" ON "VerificationToken"`,
    )
    .catch(() => undefined);
  await client
    .query(`DROP FUNCTION IF EXISTS "identity_fail_email_verification_insert"()`)
    .catch(() => undefined);
  await client.end();
}

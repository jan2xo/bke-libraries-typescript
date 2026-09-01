import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { createIdentityMfaEnrollmentStartCapability } from "../logic/mfa-enrollment-start";
import { createHmacEmailMfaChallengeMaterialProvider } from "../providers/hmac-email-mfa-challenge-material-provider";
import { createHmacLoginMfaProofProvider } from "../providers/hmac-login-mfa-proof-provider";
import { createPostgresIdentityMfaEnrollmentStartRepository } from "../prisma/repositories/postgres-mfa-enrollment-start-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Identity MFA enrollment certification.");
}

const now = new Date("2026-08-31T05:00:00.000Z");
const sessionSecret = "identity-mfa-enrollment-cert-session-secret";
const mfaEncryptionKey = "identity-mfa-enrollment-cert-encryption-key";
const materialProvider = createHmacEmailMfaChallengeMaterialProvider(
  sessionSecret,
  mfaEncryptionKey,
);
const proofProvider = createHmacLoginMfaProofProvider(
  sessionSecret,
  mfaEncryptionKey,
);
const repository = createPostgresIdentityMfaEnrollmentStartRepository(connectionString);
const capability = createIdentityMfaEnrollmentStartCapability(
  repository,
  materialProvider,
  () => now,
);
const client = new Client({ connectionString });
await client.connect();

async function createUser(id: string, role: "ADMIN" | "CUSTOMER" = "ADMIN") {
  await client.query(
    `INSERT INTO "User" ("id", "email", "name", "role", "updatedAt", "lifecycleState")
     VALUES ($1, $2, $3, $4::"IdentityRole", $5, 'ACTIVE')`,
    [id, `${id}@example.com`, id, role, now],
  );
}

try {
  await createUser("mfa-enroll-admin");

  const first = await capability.start({ userId: "mfa-enroll-admin" });
  if (first.status !== "STARTED") {
    throw new Error(`MFA enrollment did not start: ${JSON.stringify(first)}`);
  }
  if (first.delivery.recipientEmail !== "mfa-enroll-admin@example.com") {
    throw new Error("Enrollment delivery recipient was not sourced from Identity.");
  }
  if (!/^\d{6}$/.test(first.delivery.code)) {
    throw new Error("Enrollment email challenge is not a six-digit OTP.");
  }
  if (first.expiresAt.getTime() !== now.getTime() + 10 * 60_000) {
    throw new Error("Enrollment pending state does not preserve the V1 ten-minute TTL.");
  }

  const firstHash = proofProvider.hashChallengeToken(first.challengeToken);
  if (first.delivery.reference !== firstHash.slice(0, 6).toUpperCase()) {
    throw new Error("Enrollment challenge reference does not match the token hash.");
  }

  const methodState = await client.query<{
    id: string;
    encryptedSecret: string | null;
    pendingExpiresAt: Date | null;
    enabledAt: Date | null;
    verifiedAt: Date | null;
    disabledAt: Date | null;
  }>(
    `SELECT "id", "encryptedSecret", "pendingExpiresAt", "enabledAt", "verifiedAt", "disabledAt"
       FROM "AdministratorMfaMethod"
      WHERE "userId" = 'mfa-enroll-admin'`,
  );
  const method = methodState.rows[0];
  if (
    !method ||
    method.encryptedSecret !== null ||
    method.pendingExpiresAt?.getTime() !== first.expiresAt.getTime() ||
    method.enabledAt !== null ||
    method.verifiedAt !== null ||
    method.disabledAt !== null
  ) {
    throw new Error("Enrollment pending AdministratorMfaMethod state is invalid.");
  }
  const methodId = method.id;

  const firstChallenge = await client.query<{
    tokenHash: string;
    codeHash: string | null;
    purpose: string;
    expiresAt: Date;
  }>(
    `SELECT "tokenHash", "codeHash", "purpose", "expiresAt"
       FROM "MfaChallenge"
      WHERE "userId" = 'mfa-enroll-admin'
        AND "purpose" = 'ENROLLMENT'::"MfaChallengePurpose"
        AND "consumedAt" IS NULL`,
  );
  const stored = firstChallenge.rows[0];
  if (!stored || firstChallenge.rows.length !== 1) {
    throw new Error("Expected exactly one pending ENROLLMENT challenge.");
  }
  if (
    stored.tokenHash !== firstHash ||
    !stored.codeHash ||
    !proofProvider.verifyEmailCode(stored.codeHash, first.delivery.code)
  ) {
    throw new Error("Enrollment challenge hashes are incompatible with MFA verification semantics.");
  }
  if (stored.tokenHash === first.challengeToken || stored.codeHash === first.delivery.code) {
    throw new Error("Raw enrollment challenge material leaked into PostgreSQL.");
  }

  const second = await capability.start({ userId: "mfa-enroll-admin" });
  if (second.status !== "STARTED") {
    throw new Error(`Enrollment restart failed: ${JSON.stringify(second)}`);
  }
  const secondHash = proofProvider.hashChallengeToken(second.challengeToken);
  const restartedMethod = await client.query<{ id: string; pendingExpiresAt: Date | null }>(
    `SELECT "id", "pendingExpiresAt"
       FROM "AdministratorMfaMethod"
      WHERE "userId" = 'mfa-enroll-admin'`,
  );
  if (restartedMethod.rows[0]?.id !== methodId) {
    throw new Error("Enrollment restart replaced the MFA method identity instead of resetting pending state.");
  }
  const pendingChallenges = await client.query<{ tokenHash: string }>(
    `SELECT "tokenHash"
       FROM "MfaChallenge"
      WHERE "userId" = 'mfa-enroll-admin'
        AND "purpose" = 'ENROLLMENT'::"MfaChallengePurpose"
        AND "consumedAt" IS NULL`,
  );
  if (pendingChallenges.rows.length !== 1 || pendingChallenges.rows[0]?.tokenHash !== secondHash) {
    throw new Error("Enrollment restart did not converge to exactly one pending challenge.");
  }
  const stale = await client.query(`SELECT 1 FROM "MfaChallenge" WHERE "tokenHash" = $1`, [firstHash]);
  if ((stale.rowCount ?? 0) !== 0) {
    throw new Error("Superseded pending enrollment challenge was not removed.");
  }

  await createUser("mfa-enroll-enabled-admin");
  await client.query(
    `INSERT INTO "AdministratorMfaMethod"
       ("id", "userId", "encryptedSecret", "pendingExpiresAt", "enabledAt", "verifiedAt", "updatedAt")
     VALUES ($1, 'mfa-enroll-enabled-admin', NULL, NULL, $2, $2, $2)`,
    [randomUUID(), now],
  );
  const enabled = await capability.start({ userId: "mfa-enroll-enabled-admin" });
  if (enabled.status !== "REJECTED" || enabled.code !== "MFA_ALREADY_ENABLED") {
    throw new Error(`Enabled MFA was reset by enrollment start: ${JSON.stringify(enabled)}`);
  }
  const enabledChallenges = await client.query(
    `SELECT 1 FROM "MfaChallenge" WHERE "userId" = 'mfa-enroll-enabled-admin'`,
  );
  if ((enabledChallenges.rowCount ?? 0) !== 0) {
    throw new Error("Rejected enabled-MFA enrollment created a challenge.");
  }

  await createUser("mfa-enroll-customer", "CUSTOMER");
  const customer = await capability.start({ userId: "mfa-enroll-customer" });
  if (customer.status !== "REJECTED" || customer.code !== "FORBIDDEN") {
    throw new Error(`Customer started administrator MFA enrollment: ${JSON.stringify(customer)}`);
  }
  const customerMethod = await client.query(
    `SELECT 1 FROM "AdministratorMfaMethod" WHERE "userId" = 'mfa-enroll-customer'`,
  );
  if ((customerMethod.rowCount ?? 0) !== 0) {
    throw new Error("Rejected customer enrollment mutated MFA method state.");
  }

  const missing = await capability.start({ userId: "mfa-enroll-missing" });
  if (missing.status !== "REJECTED" || missing.code !== "PRINCIPAL_NOT_FOUND") {
    throw new Error(`Missing enrollment principal result was wrong: ${JSON.stringify(missing)}`);
  }

  console.log("Identity MFA enrollment start certification GREEN");
} finally {
  await client.end();
}

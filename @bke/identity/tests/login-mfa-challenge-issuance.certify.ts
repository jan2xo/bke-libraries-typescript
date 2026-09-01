import { Client } from "pg";
import { createIdentityLoginMfaChallengeIssuanceCapability } from "../logic/login-mfa-challenge-issuance";
import { createIdentityLoginMfaVerificationCapability } from "../logic/login-mfa-verification";
import { createHmacLoginMfaChallengeMaterialProvider } from "../providers/hmac-login-mfa-challenge-material-provider";
import { createHmacLoginMfaProofProvider } from "../providers/hmac-login-mfa-proof-provider";
import { createPostgresIdentityLoginMfaChallengeRepository } from "../prisma/repositories/postgres-login-mfa-challenge-repository";
import { createPostgresIdentityLoginMfaRepository } from "../prisma/repositories/postgres-login-mfa-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Identity login MFA challenge certification.");
}

const now = new Date("2026-08-31T04:00:00.000Z");
const sessionSecret = "identity-login-mfa-challenge-cert-session-secret";
const mfaEncryptionKey = "identity-login-mfa-challenge-cert-encryption-key";
const materialProvider = createHmacLoginMfaChallengeMaterialProvider(
  sessionSecret,
  mfaEncryptionKey,
);
const proofProvider = createHmacLoginMfaProofProvider(
  sessionSecret,
  mfaEncryptionKey,
);
const issuanceRepository = createPostgresIdentityLoginMfaChallengeRepository(
  connectionString,
);
const verificationRepository = createPostgresIdentityLoginMfaRepository(connectionString);
const issuance = createIdentityLoginMfaChallengeIssuanceCapability(
  issuanceRepository,
  materialProvider,
  () => now,
);
const verification = createIdentityLoginMfaVerificationCapability(
  verificationRepository,
  proofProvider,
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
  await createUser("mfa-challenge-admin");

  const first = await issuance.issue({ userId: "mfa-challenge-admin" });
  if (first.status !== "ISSUED") {
    throw new Error(`First login MFA challenge was not issued: ${JSON.stringify(first)}`);
  }
  if (first.challenge.delivery.recipientEmail !== "mfa-challenge-admin@example.com") {
    throw new Error("Challenge delivery recipient did not come from the Identity principal.");
  }
  if (!/^\d{6}$/.test(first.challenge.delivery.code)) {
    throw new Error("Challenge delivery code is not a six-digit OTP.");
  }
  if (
    first.challenge.expiresAt.getTime() !==
    now.getTime() + 10 * 60_000
  ) {
    throw new Error("Login MFA challenge does not preserve the V1 ten-minute TTL.");
  }

  const firstHash = proofProvider.hashChallengeToken(first.challenge.challengeToken);
  if (first.challenge.delivery.reference !== firstHash.slice(0, 6).toUpperCase()) {
    throw new Error("Challenge reference does not match the V1 token-hash reference rule.");
  }

  const firstStored = await client.query<{
    tokenHash: string;
    codeHash: string | null;
    purpose: string;
    attemptCount: number;
    consumedAt: Date | null;
    expiresAt: Date;
  }>(
    `SELECT "tokenHash", "codeHash", "purpose", "attemptCount", "consumedAt", "expiresAt"
       FROM "MfaChallenge"
      WHERE "userId" = 'mfa-challenge-admin'
        AND "purpose" = 'LOGIN'::"MfaChallengePurpose"`,
  );
  if (firstStored.rows.length !== 1) {
    throw new Error("Expected exactly one pending LOGIN challenge after issuance.");
  }
  const stored = firstStored.rows[0];
  if (!stored || stored.tokenHash !== firstHash) {
    throw new Error("PostgreSQL did not store the expected HMAC challenge-token hash.");
  }
  if (
    stored.tokenHash === first.challenge.challengeToken ||
    stored.codeHash === first.challenge.delivery.code
  ) {
    throw new Error("Raw MFA challenge token or OTP leaked into PostgreSQL.");
  }
  if (
    stored.purpose !== "LOGIN" ||
    stored.attemptCount !== 0 ||
    stored.consumedAt !== null
  ) {
    throw new Error("Fresh LOGIN challenge persisted with invalid initial state.");
  }

  const second = await issuance.issue({ userId: "mfa-challenge-admin" });
  if (second.status !== "ISSUED") {
    throw new Error(`Replacement login MFA challenge was not issued: ${JSON.stringify(second)}`);
  }
  const secondHash = proofProvider.hashChallengeToken(second.challenge.challengeToken);
  const replacement = await client.query<{ tokenHash: string }>(
    `SELECT "tokenHash"
       FROM "MfaChallenge"
      WHERE "userId" = 'mfa-challenge-admin'
        AND "purpose" = 'LOGIN'::"MfaChallengePurpose"
        AND "consumedAt" IS NULL`,
  );
  if (replacement.rows.length !== 1 || replacement.rows[0]?.tokenHash !== secondHash) {
    throw new Error("Pending LOGIN challenge replacement did not converge to one new challenge.");
  }
  const oldPending = await client.query(
    `SELECT 1 FROM "MfaChallenge" WHERE "tokenHash" = $1`,
    [firstHash],
  );
  if ((oldPending.rowCount ?? 0) !== 0) {
    throw new Error("Superseded pending LOGIN challenge was not removed.");
  }

  const verified = await verification.verify({
    challengeToken: second.challenge.challengeToken,
    code: second.challenge.delivery.code,
  });
  if (
    verified.status !== "VERIFIED" ||
    verified.userId !== "mfa-challenge-admin" ||
    verified.authenticationMethod !== "PASSWORD_EMAIL_OTP"
  ) {
    throw new Error(`Issued challenge could not be verified: ${JSON.stringify(verified)}`);
  }

  await createUser("mfa-challenge-customer", "CUSTOMER");
  const forbidden = await issuance.issue({ userId: "mfa-challenge-customer" });
  if (forbidden.status !== "REJECTED" || forbidden.code !== "FORBIDDEN") {
    throw new Error(`Customer received an administrator MFA challenge: ${JSON.stringify(forbidden)}`);
  }
  const customerChallenges = await client.query(
    `SELECT 1 FROM "MfaChallenge" WHERE "userId" = 'mfa-challenge-customer'`,
  );
  if ((customerChallenges.rowCount ?? 0) !== 0) {
    throw new Error("Rejected customer challenge mutated PostgreSQL.");
  }

  const missing = await issuance.issue({ userId: "mfa-challenge-missing" });
  if (missing.status !== "REJECTED" || missing.code !== "PRINCIPAL_NOT_FOUND") {
    throw new Error(`Missing principal challenge result was wrong: ${JSON.stringify(missing)}`);
  }

  console.log("Identity login MFA challenge issuance certification GREEN");
} finally {
  await client.end();
}

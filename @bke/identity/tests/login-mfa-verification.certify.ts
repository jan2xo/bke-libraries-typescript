import { createHash, createHmac, randomUUID } from "node:crypto";
import { Client } from "pg";
import { createIdentityLoginMfaVerificationCapability } from "../logic/login-mfa-verification";
import { createHmacLoginMfaProofProvider } from "../providers/hmac-login-mfa-proof-provider";
import { createPostgresIdentityLoginMfaRepository } from "../prisma/repositories/postgres-login-mfa-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Identity login MFA certification.");
}

const now = new Date("2026-08-31T03:00:00.000Z");
const sessionSecret = "identity-login-mfa-cert-session-secret";
const mfaEncryptionKey = "identity-login-mfa-cert-encryption-key";
const proof = createHmacLoginMfaProofProvider(sessionSecret, mfaEncryptionKey);
const repository = createPostgresIdentityLoginMfaRepository(connectionString);
const capability = createIdentityLoginMfaVerificationCapability(repository, proof, () => now);
const client = new Client({ connectionString });
await client.connect();

const mfaKey = createHash("sha256").update(mfaEncryptionKey).digest();
const hashEmailCode = (code: string) =>
  createHmac("sha256", mfaKey)
    .update(`admin-email-otp-code:${code.trim().replace(/\s/g, "")}`)
    .digest("hex");

async function createUser(id: string, role: "ADMIN" | "CUSTOMER" = "ADMIN") {
  await client.query(
    `INSERT INTO "User" ("id", "email", "name", "role", "updatedAt", "lifecycleState")
     VALUES ($1, $2, $3, $4::"IdentityRole", $5, 'ACTIVE')`,
    [id, `${id}@example.com`, id, role, now],
  );
}

async function createChallenge(input: {
  id: string;
  userId: string;
  token: string;
  codeHash?: string | null;
  purpose?: "LOGIN" | "ENROLLMENT" | "RECENT_AUTH";
  expiresAt?: Date;
  attemptCount?: number;
}) {
  await client.query(
    `INSERT INTO "MfaChallenge"
       ("id", "userId", "purpose", "tokenHash", "codeHash", "expiresAt", "attemptCount")
     VALUES ($1, $2, $3::"MfaChallengePurpose", $4, $5, $6, $7)`,
    [
      input.id,
      input.userId,
      input.purpose ?? "LOGIN",
      proof.hashChallengeToken(input.token),
      input.codeHash ?? null,
      input.expiresAt ?? new Date(now.getTime() + 10 * 60_000),
      input.attemptCount ?? 0,
    ],
  );
}

try {
  await createUser("mfa-email-admin");
  await createChallenge({
    id: "mfa-email-challenge",
    userId: "mfa-email-admin",
    token: "mfa-email-token",
    codeHash: hashEmailCode("123456"),
  });

  const wrong = await capability.verify({
    challengeToken: "mfa-email-token",
    code: "000000",
  });
  if (wrong.status !== "INVALID" || wrong.code !== "INVALID_CODE") {
    throw new Error(`Wrong email OTP did not fail closed: ${JSON.stringify(wrong)}`);
  }
  const attempts = await client.query<{ attemptCount: number }>(
    `SELECT "attemptCount" FROM "MfaChallenge" WHERE "id" = 'mfa-email-challenge'`,
  );
  if (attempts.rows[0]?.attemptCount !== 1) {
    throw new Error("Invalid email OTP did not increment the challenge attempt count.");
  }

  const emailVerified = await capability.verify({
    challengeToken: "mfa-email-token",
    code: "123456",
  });
  if (
    emailVerified.status !== "VERIFIED" ||
    emailVerified.userId !== "mfa-email-admin" ||
    emailVerified.authenticationMethod !== "PASSWORD_EMAIL_OTP"
  ) {
    throw new Error(`Email OTP was not verified: ${JSON.stringify(emailVerified)}`);
  }
  const emailConsumed = await client.query<{ consumedAt: Date | null }>(
    `SELECT "consumedAt" FROM "MfaChallenge" WHERE "id" = 'mfa-email-challenge'`,
  );
  if (!emailConsumed.rows[0]?.consumedAt) {
    throw new Error("Verified email-OTP challenge was not consumed.");
  }

  const reuse = await capability.verify({
    challengeToken: "mfa-email-token",
    code: "123456",
  });
  if (reuse.status !== "INVALID" || reuse.code !== "INVALID_CHALLENGE") {
    throw new Error(`Consumed challenge was reusable: ${JSON.stringify(reuse)}`);
  }

  await createUser("mfa-recovery-admin");
  const recoveryCode = "ABCDE-FGHIJ";
  const recoveryId = randomUUID();
  await client.query(
    `INSERT INTO "AdministratorRecoveryCode" ("id", "userId", "codeHash")
     VALUES ($1, $2, $3)`,
    [recoveryId, "mfa-recovery-admin", proof.hashRecoveryCode(recoveryCode)],
  );
  await createChallenge({
    id: "mfa-recovery-challenge",
    userId: "mfa-recovery-admin",
    token: "mfa-recovery-token",
    codeHash: hashEmailCode("654321"),
  });

  const recoveryVerified = await capability.verify({
    challengeToken: "mfa-recovery-token",
    code: recoveryCode,
  });
  if (
    recoveryVerified.status !== "VERIFIED" ||
    recoveryVerified.authenticationMethod !== "PASSWORD_RECOVERY"
  ) {
    throw new Error(`Recovery code was not verified: ${JSON.stringify(recoveryVerified)}`);
  }
  const recoveryState = await client.query<{
    challengeConsumedAt: Date | null;
    recoveryUsedAt: Date | null;
  }>(
    `SELECT
       c."consumedAt" AS "challengeConsumedAt",
       r."usedAt" AS "recoveryUsedAt"
     FROM "MfaChallenge" c
     JOIN "AdministratorRecoveryCode" r ON r."id" = $1
     WHERE c."id" = 'mfa-recovery-challenge'`,
    [recoveryId],
  );
  if (
    !recoveryState.rows[0]?.challengeConsumedAt ||
    !recoveryState.rows[0]?.recoveryUsedAt
  ) {
    throw new Error("Recovery proof did not atomically consume both records.");
  }

  await createUser("mfa-limit-admin");
  await createChallenge({
    id: "mfa-limit-challenge",
    userId: "mfa-limit-admin",
    token: "mfa-limit-token",
    codeHash: hashEmailCode("222222"),
    attemptCount: 5,
  });
  const limited = await capability.verify({
    challengeToken: "mfa-limit-token",
    code: "222222",
  });
  if (limited.status !== "INVALID" || limited.code !== "INVALID_CHALLENGE") {
    throw new Error(`Attempt-ceiling challenge was accepted: ${JSON.stringify(limited)}`);
  }

  await createUser("mfa-expired-admin");
  await createChallenge({
    id: "mfa-expired-challenge",
    userId: "mfa-expired-admin",
    token: "mfa-expired-token",
    codeHash: hashEmailCode("333333"),
    expiresAt: now,
  });
  const expired = await capability.verify({
    challengeToken: "mfa-expired-token",
    code: "333333",
  });
  if (expired.status !== "INVALID" || expired.code !== "INVALID_CHALLENGE") {
    throw new Error(`Expired challenge was accepted: ${JSON.stringify(expired)}`);
  }

  await createUser("mfa-customer", "CUSTOMER");
  await createChallenge({
    id: "mfa-customer-challenge",
    userId: "mfa-customer",
    token: "mfa-customer-token",
    codeHash: hashEmailCode("444444"),
  });
  const customer = await capability.verify({
    challengeToken: "mfa-customer-token",
    code: "444444",
  });
  if (customer.status !== "INVALID" || customer.code !== "INVALID_CHALLENGE") {
    throw new Error(`Non-admin login MFA challenge was accepted: ${JSON.stringify(customer)}`);
  }

  console.log("Identity login MFA verification certification GREEN");
} finally {
  await client.end();
}

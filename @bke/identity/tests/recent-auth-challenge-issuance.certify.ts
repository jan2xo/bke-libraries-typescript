import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { createIdentityRecentAuthChallengeIssuanceCapability } from "../logic/recent-auth-challenge-issuance";
import { createHmacEmailMfaChallengeMaterialProvider } from "../providers/hmac-email-mfa-challenge-material-provider";
import { createHmacEmailMfaProofProvider } from "../providers/hmac-email-mfa-proof-provider";
import { createPostgresIdentityRecentAuthChallengeRepository } from "../prisma/repositories/postgres-recent-auth-challenge-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for recent-auth challenge certification.");
}

const now = new Date("2026-08-31T08:00:00.000Z");
const sessionSecret = "identity-recent-auth-challenge-cert-session-secret";
const mfaEncryptionKey = "identity-recent-auth-challenge-cert-encryption-key";
const materialProvider = createHmacEmailMfaChallengeMaterialProvider(
  sessionSecret,
  mfaEncryptionKey,
);
const proofProvider = createHmacEmailMfaProofProvider(
  sessionSecret,
  mfaEncryptionKey,
);
const repository = createPostgresIdentityRecentAuthChallengeRepository(
  connectionString,
);
const capability = createIdentityRecentAuthChallengeIssuanceCapability(
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
  await createUser("recent-auth-admin");

  // Seed an unrelated LOGIN challenge; RECENT_AUTH replacement must not delete it.
  await client.query(
    `INSERT INTO "MfaChallenge"
       ("id", "userId", "purpose", "tokenHash", "codeHash", "expiresAt")
     VALUES ($1, $2, 'LOGIN', $3, $4, $5)`,
    [
      randomUUID(),
      "recent-auth-admin",
      "recent-auth-unrelated-login-token-hash",
      "recent-auth-unrelated-login-code-hash",
      new Date(now.getTime() + 10 * 60_000),
    ],
  );

  const first = await capability.issue({ userId: "recent-auth-admin" });
  if (first.status !== "ISSUED") {
    throw new Error(`First recent-auth challenge was not issued: ${JSON.stringify(first)}`);
  }
  if (first.challenge.delivery.recipientEmail !== "recent-auth-admin@example.com") {
    throw new Error("Recent-auth recipient did not come from the Identity principal.");
  }
  if (!/^\d{6}$/.test(first.challenge.delivery.code)) {
    throw new Error("Recent-auth delivery code is not a six-digit OTP.");
  }
  if (first.challenge.expiresAt.getTime() !== now.getTime() + 10 * 60_000) {
    throw new Error("Recent-auth challenge does not preserve the ten-minute TTL.");
  }

  const firstHash = proofProvider.hashChallengeToken(first.challenge.challengeToken);
  if (first.challenge.delivery.reference !== firstHash.slice(0, 6).toUpperCase()) {
    throw new Error("Recent-auth reference does not match the token-hash reference rule.");
  }

  const stored = await client.query<{
    tokenHash: string;
    codeHash: string | null;
    purpose: string;
    attemptCount: number;
    consumedAt: Date | null;
    expiresAt: Date;
  }>(
    `SELECT "tokenHash", "codeHash", "purpose", "attemptCount", "consumedAt", "expiresAt"
       FROM "MfaChallenge"
      WHERE "userId" = 'recent-auth-admin'
        AND "purpose" = 'RECENT_AUTH'::"MfaChallengePurpose"`,
  );
  if (stored.rows.length !== 1) {
    throw new Error("Expected exactly one pending RECENT_AUTH challenge after issuance.");
  }
  const row = stored.rows[0];
  if (!row || row.tokenHash !== firstHash) {
    throw new Error("PostgreSQL did not store the expected recent-auth token HMAC.");
  }
  if (!row.codeHash || !proofProvider.verifyEmailCode(row.codeHash, first.challenge.delivery.code)) {
    throw new Error("Persisted recent-auth OTP hash does not verify the delivered code.");
  }
  if (
    row.tokenHash === first.challenge.challengeToken ||
    row.codeHash === first.challenge.delivery.code
  ) {
    throw new Error("Raw recent-auth token or OTP leaked into PostgreSQL.");
  }
  if (
    row.purpose !== "RECENT_AUTH" ||
    row.attemptCount !== 0 ||
    row.consumedAt !== null ||
    row.expiresAt.getTime() !== first.challenge.expiresAt.getTime()
  ) {
    throw new Error("Fresh RECENT_AUTH challenge persisted with invalid state.");
  }

  const loginBeforeReplacement = await client.query(
    `SELECT 1 FROM "MfaChallenge"
      WHERE "userId" = 'recent-auth-admin'
        AND "purpose" = 'LOGIN'::"MfaChallengePurpose"`,
  );
  if ((loginBeforeReplacement.rowCount ?? 0) !== 1) {
    throw new Error("Recent-auth issuance touched an unrelated LOGIN challenge.");
  }

  const second = await capability.issue({ userId: "recent-auth-admin" });
  if (second.status !== "ISSUED") {
    throw new Error(`Replacement recent-auth challenge was not issued: ${JSON.stringify(second)}`);
  }
  const secondHash = proofProvider.hashChallengeToken(second.challenge.challengeToken);
  const replacement = await client.query<{ tokenHash: string }>(
    `SELECT "tokenHash"
       FROM "MfaChallenge"
      WHERE "userId" = 'recent-auth-admin'
        AND "purpose" = 'RECENT_AUTH'::"MfaChallengePurpose"
        AND "consumedAt" IS NULL`,
  );
  if (replacement.rows.length !== 1 || replacement.rows[0]?.tokenHash !== secondHash) {
    throw new Error("RECENT_AUTH replacement did not converge to one new challenge.");
  }
  const oldPending = await client.query(
    `SELECT 1 FROM "MfaChallenge" WHERE "tokenHash" = $1`,
    [firstHash],
  );
  if ((oldPending.rowCount ?? 0) !== 0) {
    throw new Error("Superseded pending RECENT_AUTH challenge was not removed.");
  }
  const loginAfterReplacement = await client.query(
    `SELECT 1 FROM "MfaChallenge"
      WHERE "userId" = 'recent-auth-admin'
        AND "purpose" = 'LOGIN'::"MfaChallengePurpose"`,
  );
  if ((loginAfterReplacement.rowCount ?? 0) !== 1) {
    throw new Error("RECENT_AUTH replacement deleted an unrelated LOGIN challenge.");
  }

  await createUser("recent-auth-customer", "CUSTOMER");
  const forbidden = await capability.issue({ userId: "recent-auth-customer" });
  if (forbidden.status !== "REJECTED" || forbidden.code !== "FORBIDDEN") {
    throw new Error(`Customer received recent-auth admin MFA challenge: ${JSON.stringify(forbidden)}`);
  }
  const customerChallenges = await client.query(
    `SELECT 1 FROM "MfaChallenge" WHERE "userId" = 'recent-auth-customer'`,
  );
  if ((customerChallenges.rowCount ?? 0) !== 0) {
    throw new Error("Rejected customer recent-auth challenge mutated PostgreSQL.");
  }

  const missing = await capability.issue({ userId: "recent-auth-missing" });
  if (missing.status !== "REJECTED" || missing.code !== "PRINCIPAL_NOT_FOUND") {
    throw new Error(`Missing recent-auth principal result was wrong: ${JSON.stringify(missing)}`);
  }

  console.log("Identity recent-auth challenge issuance certification GREEN");
} finally {
  await client.end();
}

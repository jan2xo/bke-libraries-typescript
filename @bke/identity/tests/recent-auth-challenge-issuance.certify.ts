import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { createIdentityRecentAuthChallengeIssuanceCapability } from "../logic/recent-auth-challenge-issuance";
import { createHmacEmailMfaChallengeMaterialProvider } from "../providers/hmac-email-mfa-challenge-material-provider";
import { createHmacEmailMfaProofProvider } from "../providers/hmac-email-mfa-proof-provider";
import { createPostgresIdentityRecentAuthChallengeRepository } from "../prisma/repositories/postgres-recent-auth-challenge-repository";
import type { IdentitySessionValidationCapability } from "../contracts/session-validation.contract";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for recent-auth challenge certification.");
}

const now = new Date();
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
const sessionValidation = {
  validate: async (token: string) => {
    const entries: Record<string, { id: string; userId: string }> = {
      "verified-google-session": { id: "recent-auth-google-session", userId: "recent-auth-google-customer" },
      "unverified-google-session": { id: "recent-auth-google-unverified-session", userId: "recent-auth-google-unverified-customer" },
    };
    const entry = entries[token];
    if (!entry) return { status: "INVALID" as const, code: "SESSION_NOT_FOUND" as const };
    return {
      status: "VALID" as const,
      context: {
        session: { id: entry.id, authenticationMethod: "GOOGLE_OIDC" },
        principal: { id: entry.userId },
        mfaEnabled: false,
      },
    };
  },
} as unknown as IdentitySessionValidationCapability;
const capability = createIdentityRecentAuthChallengeIssuanceCapability(
  repository, materialProvider, () => now, sessionValidation,
);
const client = new Client({ connectionString });
await client.connect();

async function createUser(
  id: string,
  role: "ADMIN" | "CUSTOMER" = "ADMIN",
  emailVerified: Date | null = now,
) {
  await client.query(
    `INSERT INTO "User" ("id", "email", "name", "emailVerified", "role", "updatedAt", "lifecycleState")
     VALUES ($1, $2, $3, $4, $5::"IdentityRole", $6, 'ACTIVE')`,
    [id, `${id}@example.com`, id, emailVerified, role, now],
  );
}

try {
  await createUser("recent-auth-admin");
  await client.query(
    `INSERT INTO "AdministratorMfaMethod"
       ("id", "userId", "enabledAt", "verifiedAt", "updatedAt")
     VALUES ($1, $2, $3, $3, $3)`,
    ["recent-auth-admin-method", "recent-auth-admin", now],
  );

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

  await createUser("recent-auth-customer-no-mfa", "CUSTOMER");
  const customerNoMfa = await capability.issue({
    userId: "recent-auth-customer-no-mfa",
  });
  if (customerNoMfa.status !== "REJECTED" || customerNoMfa.code !== "FORBIDDEN") {
    throw new Error(
      `Customer without MFA received a recent-auth challenge: ${JSON.stringify(customerNoMfa)}`,
    );
  }

  await createUser("recent-auth-customer", "CUSTOMER");
  await client.query(
    `INSERT INTO "AdministratorMfaMethod"
       ("id", "userId", "enabledAt", "verifiedAt", "updatedAt")
     VALUES ($1, $2, $3, $3, $3)`,
    ["recent-auth-customer-method", "recent-auth-customer", now],
  );
  const customer = await capability.issue({ userId: "recent-auth-customer" });
  if (
    customer.status !== "ISSUED" ||
    customer.challenge.delivery.recipientEmail !==
      "recent-auth-customer@example.com"
  ) {
    throw new Error(
      `MFA-enabled customer recent-auth challenge was not issued: ${JSON.stringify(customer)}`,
    );
  }

  await createUser("recent-auth-google-customer", "CUSTOMER");
  const googleSessionId = "recent-auth-google-session";
  await client.query(
    `INSERT INTO "GoogleIdentity" ("userId", "subject", "updatedAt") VALUES ($1, $2, $3)`,
    ["recent-auth-google-customer", "recent-auth-google-subject", now],
  );
  await client.query(
    `INSERT INTO "Session" (
       "id", "tokenHash", "userId", "expiresAt", "lastAuthenticatedAt",
       "mfaVerifiedAt", "recentAuthenticatedAt", "lastSeenAt", "absoluteExpiresAt",
       "authenticationMethod", "assuranceLevel"
     ) VALUES ($1, $2, $3, $4, $5, NULL, NULL, $5, $6, 'GOOGLE_OIDC', 'BASIC')`,
    [
      googleSessionId,
      "recent-auth-google-session-token-hash",
      "recent-auth-google-customer",
      new Date(now.getTime() + 30 * 60_000),
      now,
      new Date(now.getTime() + 14 * 24 * 60 * 60_000),
    ],
  );
  const googleCustomerChallenge = await capability.issue({ sessionToken: "verified-google-session" });
  if (googleCustomerChallenge.status !== "ISSUED") {
    throw new Error(
      `Verified-contact Google customer without enrolled MFA could not get local step-up: ${JSON.stringify(googleCustomerChallenge)}`,
    );
  }
  const googleChallengeState = await client.query<{
    sessionId: string | null;
    primaryAuthenticationMethod: string;
  }>(
    `SELECT "sessionId", "primaryAuthenticationMethod"::text AS "primaryAuthenticationMethod"
       FROM "MfaChallenge"
      WHERE "tokenHash" = $1`,
    [proofProvider.hashChallengeToken(googleCustomerChallenge.challenge.challengeToken)],
  );
  if (
    googleChallengeState.rows[0]?.sessionId !== googleSessionId ||
    googleChallengeState.rows[0]?.primaryAuthenticationMethod !== "GOOGLE_OIDC"
  ) {
    throw new Error("The Google step-up challenge was not bound to the live Google session.");
  }
  const noEnrollment = await client.query(
    `SELECT 1 FROM "AdministratorMfaMethod" WHERE "userId" = 'recent-auth-google-customer'`,
  );
  if (noEnrollment.rowCount !== 0) {
    throw new Error("Issuing an email step-up challenge silently enrolled application MFA.");
  }

  await createUser("recent-auth-google-unverified-customer", "CUSTOMER", null);
  const unverifiedGoogleSessionId = "recent-auth-google-unverified-session";
  await client.query(
    `INSERT INTO "Session" (
       "id", "tokenHash", "userId", "expiresAt", "lastAuthenticatedAt",
       "mfaVerifiedAt", "recentAuthenticatedAt", "lastSeenAt", "absoluteExpiresAt",
       "authenticationMethod", "assuranceLevel"
     ) VALUES ($1, $2, $3, $4, $5, NULL, NULL, $5, $6, 'GOOGLE_OIDC', 'BASIC')`,
    [
      unverifiedGoogleSessionId,
      "recent-auth-google-unverified-token-hash",
      "recent-auth-google-unverified-customer",
      new Date(now.getTime() + 30 * 60_000),
      now,
      new Date(now.getTime() + 14 * 24 * 60 * 60_000),
    ],
  );
  const unverifiedGoogle = await capability.issue({ sessionToken: "unverified-google-session" });
  if (unverifiedGoogle.status !== "REJECTED" || unverifiedGoogle.code !== "FORBIDDEN") {
    throw new Error("An unverified contact email received a Google customer step-up challenge.");
  }

  const missing = await capability.issue({ userId: "recent-auth-missing" });
  if (missing.status !== "REJECTED" || missing.code !== "PRINCIPAL_NOT_FOUND") {
    throw new Error(`Missing recent-auth principal result was wrong: ${JSON.stringify(missing)}`);
  }

  console.log("Identity recent-auth challenge issuance certification GREEN");
} finally {
  await client.end();
}

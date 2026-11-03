import { createHash, createHmac } from "node:crypto";
import argon2 from "argon2";
import { Client } from "pg";
import type { IdentitySessionValidationCapability } from "../contracts/session-validation.contract";
import type { IdentityIssuedSession } from "../contracts/session.contract";
import { createIdentityRecentAuthCompletionCapability } from "../logic/recent-auth-completion";
import { createIdentityMfaEnrollmentStartCapability } from "../logic/mfa-enrollment-start";
import { createIdentityMfaEnrollmentCompletionCapability } from "../logic/mfa-enrollment-completion";
import { createArgon2PasswordVerifier } from "../providers/argon2-password-verifier";
import { createHmacEmailMfaProofProvider } from "../providers/hmac-email-mfa-proof-provider";
import { createHmacEmailMfaChallengeMaterialProvider } from "../providers/hmac-email-mfa-challenge-material-provider";
import { createHmacMfaRecoveryCodeProvider } from "../providers/hmac-mfa-recovery-code-provider";
import { createPostgresIdentityRecentAuthCompletionRepository } from "../prisma/repositories/postgres-recent-auth-completion-repository";
import { createPostgresIdentityMfaEnrollmentStartRepository } from "../prisma/repositories/postgres-mfa-enrollment-start-repository";
import { createPostgresIdentityMfaEnrollmentCompletionRepository } from "../prisma/repositories/postgres-mfa-enrollment-completion-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Identity recent-auth completion certification.");

const now = new Date();
const sessionSecret = "identity-recent-auth-completion-session-secret";
const mfaEncryptionKey = "identity-recent-auth-completion-mfa-key";
const password = "CorrectPassword123";
const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
const proofProvider = createHmacEmailMfaProofProvider(sessionSecret, mfaEncryptionKey);
const passwordVerifier = createArgon2PasswordVerifier();
const repository = createPostgresIdentityRecentAuthCompletionRepository(connectionString);
const client = new Client({ connectionString });
await client.connect();

const mfaKey = createHash("sha256").update(mfaEncryptionKey).digest();
const hashEmailCode = (code: string) => createHmac("sha256", mfaKey).update(`admin-email-otp-code:${code.trim().replace(/\s/g, "")}`).digest("hex");

async function seedUser(input: { id: string; role: "CUSTOMER" | "ADMIN"; sessionId: string; tokenHash: string; assuranceLevel: "BASIC" | "MFA_VERIFIED"; authenticationMethod?: IdentityIssuedSession["authenticationMethod"]; hasPassword?: boolean; }) {
  const mfaEnabled = input.assuranceLevel === "MFA_VERIFIED";
  await client.query(
    `INSERT INTO "User" ("id", "email", "name", "emailVerified", "role", "createdAt", "updatedAt", "lifecycleState")
     VALUES ($1, $2, $3, $5, $4::"IdentityRole", $6, $7, 'ACTIVE')`,
    [input.id, `${input.id}@example.com`, input.id, input.role, now, new Date("2026-01-01T00:00:00.000Z"), now],
  );
  if (input.hasPassword !== false) {
    await client.query(`INSERT INTO "PasswordCredential" ("userId", "passwordHash") VALUES ($1, $2)`, [input.id, passwordHash]);
  }
  if (mfaEnabled) {
    await client.query(
      `INSERT INTO "AdministratorMfaMethod"
         ("id", "userId", "enabledAt", "verifiedAt", "updatedAt")
       VALUES ($1, $2, $3, $3, $3)`,
      [`recent-auth-mfa-${input.id}`, input.id, now],
    );
  }
  await client.query(
    `INSERT INTO "Session" (
       "id", "tokenHash", "userId", "expiresAt", "lastAuthenticatedAt",
       "mfaVerifiedAt", "recentAuthenticatedAt", "lastSeenAt", "absoluteExpiresAt",
       "authenticationMethod", "assuranceLevel"
     ) VALUES (
       $1, $2, $3, $4, $5, $6, NULL, $5, $7,
       $8::"SessionAuthenticationMethod", $9::"SessionAssuranceLevel"
     )`,
    [
      input.sessionId,
      input.tokenHash,
      input.id,
      new Date(now.getTime() + 30 * 60_000),
      new Date(now.getTime() - 60_000),
      mfaEnabled ? new Date(now.getTime() - 30_000) : null,
      new Date(now.getTime() + 2 * 60 * 60_000),
      input.authenticationMethod ?? (mfaEnabled ? "PASSWORD_EMAIL_OTP" : "PASSWORD"),
      input.assuranceLevel,
    ],
  );
}

function validationFor(input: { userId: string; sessionId: string; role: "CUSTOMER" | "ADMIN"; assuranceLevel: "BASIC" | "MFA_VERIFIED"; authenticationMethod?: "PASSWORD" | "PASSWORD_EMAIL_OTP" | "GOOGLE_OIDC" | "MFA_ENROLLMENT"; recentAuthenticatedAt?: Date | null; }): IdentitySessionValidationCapability {
  const mfaEnabled = input.assuranceLevel === "MFA_VERIFIED";
  return {
    async validate() {
      return {
        status: "VALID" as const,
        context: {
          session: {
            id: input.sessionId,
            userId: input.userId,
            expiresAt: new Date(now.getTime() + 30 * 60_000),
            lastAuthenticatedAt: new Date(now.getTime() - 60_000),
            mfaVerifiedAt: mfaEnabled ? new Date(now.getTime() - 30_000) : null,
            recentAuthenticatedAt: input.recentAuthenticatedAt ?? null,
            lastSeenAt: new Date(now.getTime() - 60_000),
            absoluteExpiresAt: new Date(now.getTime() + 2 * 60 * 60_000),
            authenticationMethod: input.authenticationMethod ?? (mfaEnabled ? "PASSWORD_EMAIL_OTP" : "PASSWORD"),
            assuranceLevel: input.assuranceLevel,
            createdAt: new Date(now.getTime() - 10 * 60_000),
          },
          principal: {
            id: input.userId,
            email: `${input.userId}@example.com`,
            name: input.userId,
            emailVerified: now,
            role: input.role,
            establishedAt: new Date("2026-01-01T00:00:00.000Z"),
            suspendedAt: null,
            lifecycleState: "ACTIVE" as const,
          },
          mfaEnabled,
        },
      };
    },
  };
}

async function createChallenge(input: {
  id: string;
  userId: string;
  token: string;
  code: string;
  purpose?: "LOGIN" | "RECENT_AUTH";
  sessionId?: string;
  primaryAuthenticationMethod?: "PASSWORD" | "GOOGLE_OIDC";
}) {
  await client.query(
    `INSERT INTO "MfaChallenge" (
       "id", "userId", "purpose", "primaryAuthenticationMethod", "sessionId",
       "tokenHash", "codeHash", "expiresAt"
     ) VALUES ($1, $2, $3::"MfaChallengePurpose", $4::"MfaChallengeAuthenticationMethod", $5, $6, $7, $8)`,
    [
      input.id, input.userId, input.purpose ?? "RECENT_AUTH",
      input.primaryAuthenticationMethod ?? "PASSWORD", input.sessionId ?? null,
      proofProvider.hashChallengeToken(input.token), hashEmailCode(input.code),
      new Date(now.getTime() + 10 * 60_000),
    ],
  );
}

try {
  await seedUser({ id: "recent-customer", role: "CUSTOMER", sessionId: "recent-customer-session", tokenHash: "customer-token-hash", assuranceLevel: "BASIC" });
  const customerCapability = createIdentityRecentAuthCompletionCapability(
    repository,
    validationFor({ userId: "recent-customer", sessionId: "recent-customer-session", role: "CUSTOMER", assuranceLevel: "BASIC" }),
    passwordVerifier,
    proofProvider,
    () => now,
  );
  const customer = await customerCapability.complete({ sessionToken: "customer-boundary-token", password });
  if (customer.status !== "COMPLETED" || customer.verificationMethod !== "PASSWORD" || customer.session.assuranceLevel !== "RECENTLY_AUTHENTICATED" || customer.session.recentAuthenticatedAt?.getTime() !== now.getTime()) {
    throw new Error(`Customer recent-auth completion failed: ${JSON.stringify(customer)}`);
  }

  const googleUserId = "recent-google-customer";
  const googleSessionId = "recent-google-session";
  const googleSubject = "stable-google-subject";
  await seedUser({
    id: googleUserId,
    role: "CUSTOMER",
    sessionId: googleSessionId,
    tokenHash: "google-token-hash",
    assuranceLevel: "MFA_VERIFIED",
    authenticationMethod: "GOOGLE_OIDC",
    hasPassword: false,
  });
  await client.query(
    `INSERT INTO "GoogleIdentity" ("userId", "subject", "updatedAt") VALUES ($1, $2, $3)`,
    [googleUserId, googleSubject, now],
  );
  await createChallenge({
    id: "recent-google-challenge",
    userId: googleUserId,
    token: "recent-google-token",
    code: "123456",
    sessionId: googleSessionId,
    primaryAuthenticationMethod: "GOOGLE_OIDC",
  });
  const googleCapability = createIdentityRecentAuthCompletionCapability(
    repository,
    validationFor({
      userId: googleUserId,
      sessionId: googleSessionId,
      role: "CUSTOMER",
      assuranceLevel: "MFA_VERIFIED",
      authenticationMethod: "GOOGLE_OIDC",
    }),
    passwordVerifier,
    proofProvider,
    () => now,
  );
  const googleResult = await googleCapability.complete({
    sessionToken: "google-boundary-token",
    challengeToken: "recent-google-token",
    code: "123456",
  });
  if (
    googleResult.status !== "COMPLETED" ||
    googleResult.verificationMethod !== "GOOGLE_OIDC_EMAIL_OTP" ||
    googleResult.session.recentAuthenticatedAt?.getTime() !== now.getTime()
  ) {
    throw new Error(`Google app-factor recent-auth did not record its completion time: ${JSON.stringify(googleResult)}`);
  }
  if (
    await repository.findPasswordRecord(googleUserId).then((result) => result !== null)
  ) {
    throw new Error("Google recent-auth certification unexpectedly required password storage.");
  }

  const noMfaGoogleUserId = "recent-google-no-mfa-customer";
  const noMfaGoogleSessionId = "recent-google-no-mfa-session";
  await seedUser({
    id: noMfaGoogleUserId,
    role: "CUSTOMER",
    sessionId: noMfaGoogleSessionId,
    tokenHash: "recent-google-no-mfa-token-hash",
    assuranceLevel: "BASIC",
    authenticationMethod: "GOOGLE_OIDC",
    hasPassword: false,
  });
  await createChallenge({
    id: "recent-google-no-mfa-challenge",
    userId: noMfaGoogleUserId,
    token: "recent-google-no-mfa-token",
    code: "123456",
    sessionId: noMfaGoogleSessionId,
    primaryAuthenticationMethod: "GOOGLE_OIDC",
  });
  const noMfaGoogleCapability = createIdentityRecentAuthCompletionCapability(
    repository,
    validationFor({
      userId: noMfaGoogleUserId,
      sessionId: noMfaGoogleSessionId,
      role: "CUSTOMER",
      assuranceLevel: "BASIC",
      authenticationMethod: "GOOGLE_OIDC",
    }),
    passwordVerifier,
    proofProvider,
    () => now,
  );
  const noMfaGoogleResult = await noMfaGoogleCapability.complete({
    sessionToken: "recent-google-no-mfa-session-token",
    challengeToken: "recent-google-no-mfa-token",
    code: "123456",
  });
  if (
    noMfaGoogleResult.status !== "COMPLETED" ||
    noMfaGoogleResult.verificationMethod !== "GOOGLE_OIDC_EMAIL_OTP" ||
    noMfaGoogleResult.session.mfaVerifiedAt !== null ||
    noMfaGoogleResult.session.recentAuthenticatedAt?.getTime() !== now.getTime()
  ) {
    throw new Error("Customer Google email step-up enrolled MFA or failed to mark recent authentication.");
  }
  const noMfaStillDisabled = await client.query(
    `SELECT 1 FROM "AdministratorMfaMethod" WHERE "userId" = $1`,
    [noMfaGoogleUserId],
  );
  if (noMfaStillDisabled.rowCount !== 0) {
    throw new Error("Google CUSTOMER step-up silently enabled application MFA.");
  }

  const googleAdminId = "recent-google-bootstrap-admin";
  const googleAdminSessionId = "recent-google-bootstrap-admin-session";
  await seedUser({
    id: googleAdminId,
    role: "ADMIN",
    sessionId: googleAdminSessionId,
    tokenHash: "recent-google-bootstrap-admin-token",
    assuranceLevel: "BASIC",
    authenticationMethod: "GOOGLE_OIDC",
    hasPassword: false,
  });
  const enrollmentMaterial = createHmacEmailMfaChallengeMaterialProvider(
    sessionSecret,
    mfaEncryptionKey,
  );
  const enrollmentStart = createIdentityMfaEnrollmentStartCapability(
    createPostgresIdentityMfaEnrollmentStartRepository(connectionString),
    enrollmentMaterial,
    () => now,
  );
  const pendingEnrollment = await enrollmentStart.start({ userId: googleAdminId });
  if (pendingEnrollment.status !== "STARTED") {
    throw new Error(`Google admin enrollment could not be started: ${JSON.stringify(pendingEnrollment)}`);
  }
  const staleRecentAuth = new Date(now.getTime() - 16 * 60_000);
  await createChallenge({
    id: "recent-google-bootstrap-admin-challenge",
    userId: googleAdminId,
    token: "recent-google-bootstrap-admin-challenge-token",
    code: "123456",
    sessionId: googleAdminSessionId,
    primaryAuthenticationMethod: "GOOGLE_OIDC",
  });
  const googleAdminCapability = createIdentityRecentAuthCompletionCapability(
    repository,
    validationFor({
      userId: googleAdminId,
      sessionId: googleAdminSessionId,
      role: "ADMIN",
      assuranceLevel: "BASIC",
      authenticationMethod: "GOOGLE_OIDC",
      recentAuthenticatedAt: staleRecentAuth,
    }),
    passwordVerifier,
    proofProvider,
    () => now,
  );
  const googleAdminResult = await googleAdminCapability.complete({
    sessionToken: "recent-google-bootstrap-admin-session-token",
    challengeToken: "recent-google-bootstrap-admin-challenge-token",
    code: "123456",
  });
  if (
    googleAdminResult.status !== "COMPLETED" ||
    googleAdminResult.verificationMethod !== "GOOGLE_OIDC_EMAIL_OTP" ||
    googleAdminResult.session.mfaVerifiedAt !== null ||
    googleAdminResult.session.recentAuthenticatedAt?.getTime() !== now.getTime()
  ) {
    throw new Error("Google ADMIN app-factor bootstrap did not record recent authentication without asserting MFA.");
  }
  const googleAdminEnrollment = await client.query<{
    enabledAt: Date | null;
    verifiedAt: Date | null;
    pendingExpiresAt: Date | null;
  }>(
    `SELECT "enabledAt", "verifiedAt", "pendingExpiresAt"
       FROM "AdministratorMfaMethod" WHERE "userId" = $1`,
    [googleAdminId],
  );
  if (
    googleAdminEnrollment.rowCount !== 1 ||
    googleAdminEnrollment.rows[0]?.enabledAt !== null ||
    googleAdminEnrollment.rows[0]?.verifiedAt !== null ||
    googleAdminEnrollment.rows[0]?.pendingExpiresAt?.getTime() !== pendingEnrollment.expiresAt.getTime()
  ) {
    throw new Error("Google ADMIN factor step-up changed pending MFA enrollment state.");
  }
  const enrollmentResume = createIdentityMfaEnrollmentCompletionCapability(
    createPostgresIdentityMfaEnrollmentCompletionRepository(connectionString),
    proofProvider,
    createHmacMfaRecoveryCodeProvider(sessionSecret, mfaEncryptionKey),
    () => now,
  );
  const resumedEnrollment = await enrollmentResume.complete({
    userId: googleAdminId,
    challengeToken: pendingEnrollment.challengeToken,
    code: pendingEnrollment.delivery.code,
  });
  if (resumedEnrollment.status !== "COMPLETED" ||
      googleAdminResult.session.recentAuthenticatedAt?.getTime() !== now.getTime()) {
    throw new Error("Pending Google admin MFA enrollment did not resume after a fresh app-factor step-up.");
  }


  const legacyEnrollmentUserId = "recent-password-emergency-admin";
  const legacyEnrollmentSessionId = "recent-password-emergency-session";
  await seedUser({
    id: legacyEnrollmentUserId,
    role: "ADMIN",
    sessionId: legacyEnrollmentSessionId,
    tokenHash: "recent-password-emergency-token",
    assuranceLevel: "MFA_VERIFIED",
    authenticationMethod: "MFA_ENROLLMENT",
  });
  await createChallenge({
    id: "recent-password-emergency-challenge",
    userId: legacyEnrollmentUserId,
    token: "recent-password-emergency-challenge-token",
    code: "123456",
  });
  const legacyEnrollmentCapability = createIdentityRecentAuthCompletionCapability(
    repository,
    validationFor({
      userId: legacyEnrollmentUserId,
      sessionId: legacyEnrollmentSessionId,
      role: "ADMIN",
      assuranceLevel: "MFA_VERIFIED",
      authenticationMethod: "MFA_ENROLLMENT",
    }),
    passwordVerifier,
    proofProvider,
    () => now,
  );
  const legacyEnrollmentStepup = await legacyEnrollmentCapability.complete({
    sessionToken: "recent-password-emergency-session-token",
    password,
    challengeToken: "recent-password-emergency-challenge-token",
    code: "123456",
  });
  if (
    legacyEnrollmentStepup.status !== "COMPLETED" ||
    legacyEnrollmentStepup.verificationMethod !== "PASSWORD_EMAIL_OTP"
  ) {
    throw new Error("Legacy password MFA_ENROLLMENT session lost its existing password recent-auth path.");
  }

  const changedEnrollmentUserId = "recent-google-enrollment-race-admin";
  const changedEnrollmentSessionId = "recent-google-enrollment-race-session";
  await seedUser({
    id: changedEnrollmentUserId,
    role: "ADMIN",
    sessionId: changedEnrollmentSessionId,
    tokenHash: "recent-google-enrollment-race-token",
    assuranceLevel: "BASIC",
    authenticationMethod: "GOOGLE_OIDC",
    hasPassword: false,
  });
  await createChallenge({
    id: "recent-google-enrollment-race-challenge",
    userId: changedEnrollmentUserId,
    token: "recent-google-enrollment-race-challenge-token",
    code: "123456",
    sessionId: changedEnrollmentSessionId,
    primaryAuthenticationMethod: "GOOGLE_OIDC",
  });
  await client.query(
    `INSERT INTO "AdministratorMfaMethod"
       ("id", "userId", "enabledAt", "verifiedAt", "updatedAt")
     VALUES ($1, $2, $3, $3, $3)`,
    ["recent-google-enrollment-race-method", changedEnrollmentUserId, now],
  );
  const enrollmentChangedCapability = createIdentityRecentAuthCompletionCapability(
    repository,
    validationFor({
      userId: changedEnrollmentUserId,
      sessionId: changedEnrollmentSessionId,
      role: "ADMIN",
      assuranceLevel: "BASIC",
      authenticationMethod: "GOOGLE_OIDC",
    }),
    passwordVerifier,
    proofProvider,
    () => now,
  );
  const enrollmentChanged = await enrollmentChangedCapability.complete({
    sessionToken: "recent-google-enrollment-race-session-token",
    challengeToken: "recent-google-enrollment-race-challenge-token",
    code: "123456",
  });
  if (enrollmentChanged.status !== "INVALID" || enrollmentChanged.code !== "INVALID_SESSION") {
    throw new Error("An unenrolled Google admin step-up was accepted after MFA enrollment changed.");
  }
  const unconsumedEnrollmentRaceChallenge = await client.query(
    `SELECT "consumedAt" FROM "MfaChallenge" WHERE "id" = 'recent-google-enrollment-race-challenge'`,
  );
  if (unconsumedEnrollmentRaceChallenge.rows[0]?.consumedAt !== null) {
    throw new Error("Rejected enrollment-race factor was not rolled back atomically.");
  }

  await createChallenge({
    id: "recent-google-replay-challenge",
    userId: googleUserId,
    token: "recent-google-replay-token",
    code: "123456",
    sessionId: googleSessionId,
    primaryAuthenticationMethod: "GOOGLE_OIDC",
  });
  const repeatedFactor = await googleCapability.complete({
    sessionToken: "google-boundary-token",
    challengeToken: "recent-google-replay-token",
    code: "123456",
  });
  if (
    repeatedFactor.status !== "COMPLETED" ||
    repeatedFactor.session.recentAuthenticatedAt?.getTime() !== now.getTime()
  ) {
    throw new Error("A repeated completed app-factor did not record its completion time.");
  }

  await client.query(
    `INSERT INTO "User" ("id", "email", "name", "role", "createdAt", "updatedAt", "lifecycleState")
     VALUES ('recent-google-other-user', 'recent-google-other@example.com', 'other', 'CUSTOMER', $1, $1, 'ACTIVE')`,
    [now],
  );
  await createChallenge({
    id: "recent-google-wrong-user-challenge",
    userId: "recent-google-other-user",
    token: "recent-google-wrong-user-token",
    code: "123456",
    sessionId: googleSessionId,
    primaryAuthenticationMethod: "GOOGLE_OIDC",
  });
  const wrongUserChallenge = await googleCapability.complete({
    sessionToken: "google-boundary-token",
    challengeToken: "recent-google-wrong-user-token",
    code: "123456",
  });
  if (wrongUserChallenge.status !== "INVALID" || wrongUserChallenge.code !== "INVALID_CHALLENGE") {
    throw new Error("A Google recent-auth challenge belonging to another principal was accepted.");
  }

  await client.query(
    `INSERT INTO "Session" (
       "id", "tokenHash", "userId", "expiresAt", "lastAuthenticatedAt",
       "mfaVerifiedAt", "recentAuthenticatedAt", "lastSeenAt", "absoluteExpiresAt",
       "authenticationMethod", "assuranceLevel"
     ) VALUES ($1, $2, $3, $4, $5, $6, NULL, $5, $7, 'GOOGLE_OIDC', 'MFA_VERIFIED')`,
    [
      "recent-google-other-session",
      "recent-google-other-session-token",
      googleUserId,
      new Date(now.getTime() + 30 * 60_000),
      now,
      new Date(now.getTime() - 30_000),
      new Date(now.getTime() + 14 * 24 * 60 * 60_000),
    ],
  );
  await createChallenge({
    id: "recent-google-wrong-session-challenge",
    userId: googleUserId,
    token: "recent-google-wrong-session-token",
    code: "123456",
    sessionId: "recent-google-other-session",
    primaryAuthenticationMethod: "GOOGLE_OIDC",
  });
  const wrongSessionChallenge = await googleCapability.complete({
    sessionToken: "google-boundary-token",
    challengeToken: "recent-google-wrong-session-token",
    code: "123456",
  });
  if (wrongSessionChallenge.status !== "INVALID" || wrongSessionChallenge.code !== "INVALID_CHALLENGE") {
    throw new Error("A Google recent-auth challenge belonging to another session was accepted.");
  }

  await createChallenge({
    id: "recent-google-inactive-challenge",
    userId: googleUserId,
    token: "recent-google-inactive-token",
    code: "123456",
    sessionId: googleSessionId,
    primaryAuthenticationMethod: "GOOGLE_OIDC",
  });
  await client.query(
    `UPDATE "User" SET "lifecycleState" = 'SUSPENDED'::"IdentityLifecycleState" WHERE "id" = $1`,
    [googleUserId],
  );
  const inactiveGoogle = await googleCapability.complete({
    sessionToken: "google-boundary-token",
    challengeToken: "recent-google-inactive-token",
    code: "123456",
  });
  if (inactiveGoogle.status !== "INVALID" || inactiveGoogle.code !== "INVALID_SESSION") {
    throw new Error("An inactive Google principal completed recent authentication.");
  }
  await client.query(
    `UPDATE "User" SET "lifecycleState" = 'ACTIVE'::"IdentityLifecycleState" WHERE "id" = $1`,
    [googleUserId],
  );

  await createChallenge({
    id: "recent-google-revoked-challenge",
    userId: googleUserId,
    token: "recent-google-revoked-token",
    code: "123456",
    sessionId: googleSessionId,
    primaryAuthenticationMethod: "GOOGLE_OIDC",
  });
  await client.query(
    `UPDATE "Session" SET "revokedAt" = $2 WHERE "id" = $1`,
    [googleSessionId, now],
  );
  const revokedGoogle = await googleCapability.complete({
    sessionToken: "google-boundary-token",
    challengeToken: "recent-google-revoked-token",
    code: "123456",
  });
  if (revokedGoogle.status !== "INVALID" || revokedGoogle.code !== "INVALID_SESSION") {
    throw new Error("A revoked Google session completed recent authentication.");
  }
  const revokedChallenge = await client.query<{ consumedAt: Date | null }>(
    `SELECT "consumedAt" FROM "MfaChallenge" WHERE "id" = 'recent-google-revoked-challenge'`,
  );
  if (revokedChallenge.rows[0]?.consumedAt !== null) {
    throw new Error("Failed recent-auth session update did not roll back challenge consumption.");
  }
  await client.query(
    `UPDATE "Session" SET "revokedAt" = NULL WHERE "id" = $1`,
    [googleSessionId],
  );

  const googleReplay = await googleCapability.complete({
    sessionToken: "google-boundary-token",
    challengeToken: "recent-google-replay-token",
    code: "123456",
  });
  if (googleReplay.status !== "INVALID" || googleReplay.code !== "INVALID_CHALLENGE") {
    throw new Error("A consumed Google recent-auth challenge was replayed.");
  }

  await seedUser({ id: "recent-admin", role: "ADMIN", sessionId: "recent-admin-session", tokenHash: "admin-token-hash", assuranceLevel: "MFA_VERIFIED" });
  await createChallenge({ id: "recent-admin-login-challenge", userId: "recent-admin", token: "unrelated-login-token", code: "111111", purpose: "LOGIN" });
  await createChallenge({ id: "recent-admin-challenge", userId: "recent-admin", token: "recent-admin-token", code: "123456" });
  const adminCapability = createIdentityRecentAuthCompletionCapability(
    repository,
    validationFor({ userId: "recent-admin", sessionId: "recent-admin-session", role: "ADMIN", assuranceLevel: "MFA_VERIFIED" }),
    passwordVerifier,
    proofProvider,
    () => now,
  );
  const admin = await adminCapability.complete({ sessionToken: "admin-boundary-token", password, challengeToken: "recent-admin-token", code: "123456" });
  if (admin.status !== "COMPLETED" || admin.verificationMethod !== "PASSWORD_EMAIL_OTP" || admin.session.assuranceLevel !== "RECENTLY_AUTHENTICATED") {
    throw new Error(`Admin email-OTP recent-auth failed: ${JSON.stringify(admin)}`);
  }
  const purposeIsolation = await client.query<{ recentConsumedAt: Date | null; loginConsumedAt: Date | null }>(
    `SELECT
       (SELECT "consumedAt" FROM "MfaChallenge" WHERE "id" = 'recent-admin-challenge') AS "recentConsumedAt",
       (SELECT "consumedAt" FROM "MfaChallenge" WHERE "id" = 'recent-admin-login-challenge') AS "loginConsumedAt"`,
  );
  if (!purposeIsolation.rows[0]?.recentConsumedAt || purposeIsolation.rows[0]?.loginConsumedAt) throw new Error("RECENT_AUTH completion violated MFA challenge purpose isolation.");

  await seedUser({ id: "recent-rollback-admin", role: "ADMIN", sessionId: "recent-rollback-session", tokenHash: "rollback-token-hash", assuranceLevel: "MFA_VERIFIED" });
  const recoveryCode = "ABCDE-FGHIJ";
  await client.query(`INSERT INTO "AdministratorRecoveryCode" ("id", "userId", "codeHash") VALUES ($1, $2, $3)`, ["recent-rollback-recovery", "recent-rollback-admin", proofProvider.hashRecoveryCode(recoveryCode)]);
  await createChallenge({ id: "recent-rollback-challenge", userId: "recent-rollback-admin", token: "recent-rollback-token", code: "654321" });

  await client.query(`
    CREATE OR REPLACE FUNCTION identity_recent_auth_cert_fail_session_update()
    RETURNS trigger AS $$
    BEGIN
      IF NEW."assuranceLevel" = 'RECENTLY_AUTHENTICATED'::"SessionAssuranceLevel" THEN
        RAISE EXCEPTION 'identity recent-auth certification forced session failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await client.query(`
    CREATE TRIGGER identity_recent_auth_cert_fail_session_update_trigger
    BEFORE UPDATE ON "Session"
    FOR EACH ROW EXECUTE FUNCTION identity_recent_auth_cert_fail_session_update();
  `);

  const rollbackCapability = createIdentityRecentAuthCompletionCapability(
    repository,
    validationFor({ userId: "recent-rollback-admin", sessionId: "recent-rollback-session", role: "ADMIN", assuranceLevel: "MFA_VERIFIED" }),
    passwordVerifier,
    proofProvider,
    () => now,
  );
  const rolledBack = await rollbackCapability.complete({ sessionToken: "rollback-boundary-token", password, challengeToken: "recent-rollback-token", code: recoveryCode });
  if (rolledBack.status !== "FAILED" || rolledBack.code !== "PERSISTENCE_UNAVAILABLE") throw new Error(`Forced transaction failure did not fail closed: ${JSON.stringify(rolledBack)}`);

  await client.query(`DROP TRIGGER identity_recent_auth_cert_fail_session_update_trigger ON "Session"`);
  await client.query(`DROP FUNCTION identity_recent_auth_cert_fail_session_update()`);

  const rollbackState = await client.query<{ challengeConsumedAt: Date | null; recoveryUsedAt: Date | null; recentAuthenticatedAt: Date | null; assuranceLevel: string }>(
    `SELECT
       c."consumedAt" AS "challengeConsumedAt",
       r."usedAt" AS "recoveryUsedAt",
       s."recentAuthenticatedAt" AS "recentAuthenticatedAt",
       s."assuranceLevel"::text AS "assuranceLevel"
     FROM "MfaChallenge" c
     JOIN "AdministratorRecoveryCode" r ON r."id" = 'recent-rollback-recovery'
     JOIN "Session" s ON s."id" = 'recent-rollback-session'
     WHERE c."id" = 'recent-rollback-challenge'`,
  );
  const rollback = rollbackState.rows[0];
  if (!rollback || rollback.challengeConsumedAt !== null || rollback.recoveryUsedAt !== null || rollback.recentAuthenticatedAt !== null || rollback.assuranceLevel !== "MFA_VERIFIED") {
    throw new Error(`Recent-auth transaction was not atomic: ${JSON.stringify(rollback)}`);
  }

  console.log("Identity recent-auth completion certification GREEN");
} finally {
  await client.query(`DROP TRIGGER IF EXISTS identity_recent_auth_cert_fail_session_update_trigger ON "Session"`).catch(() => undefined);
  await client.query(`DROP FUNCTION IF EXISTS identity_recent_auth_cert_fail_session_update()`).catch(() => undefined);
  await client.end();
}

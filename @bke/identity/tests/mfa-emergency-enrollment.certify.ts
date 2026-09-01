import { randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";
import { createIdentityMfaEmergencyEnrollmentCapability } from "../logic/mfa-emergency-enrollment";
import { createHmacMfaRecoveryCodeProvider } from "../providers/hmac-mfa-recovery-code-provider";
import { createHmacSessionTokenProvider } from "../providers/hmac-session-token-provider";
import { createIdentitySessionIssuanceCapability } from "../logic/session-issuance";
import { createIdentitySessionValidationCapability } from "../logic/session-validation";
import { createPostgresIdentityMfaEmergencyEnrollmentRepository } from "../prisma/repositories/postgres-mfa-emergency-enrollment-repository";
import { createPostgresIdentitySessionRepository } from "../prisma/repositories/postgres-session-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for emergency MFA enrollment certification.");
}

const now = new Date("2026-09-01T10:30:00.000Z");
const issuedAt = new Date(now.getTime() - 5 * 60_000);
const userId = "mfa-emergency-enrollment-admin";
const email = "mfa-emergency-enrollment-admin@example.com";
const sessionSecret = "identity-mfa-emergency-session-secret";
const mfaEncryptionKey = "identity-mfa-emergency-mfa-key";
const authorizationId = "mfa-emergency-authorization";
const emergencyToken = randomBytes(32).toString("base64url");

const sessionRepository = createPostgresIdentitySessionRepository(connectionString);
const sessionTokens = createHmacSessionTokenProvider(sessionSecret);
const sessionValidation = createIdentitySessionValidationCapability(
  sessionRepository,
  sessionTokens,
  () => now,
);
const recoveryProvider = createHmacMfaRecoveryCodeProvider(
  sessionSecret,
  mfaEncryptionKey,
);
const repository = createPostgresIdentityMfaEmergencyEnrollmentRepository(
  connectionString,
);
const capability = createIdentityMfaEmergencyEnrollmentCapability(
  repository,
  sessionValidation,
  sessionTokens,
  recoveryProvider,
  () => now,
);
const client = new Client({ connectionString });
await client.connect();

async function issueCurrentSession() {
  const issuance = createIdentitySessionIssuanceCapability(
    sessionRepository,
    sessionTokens,
    () => issuedAt,
  );
  const result = await issuance.issue({
    userId,
    authenticationMethod: "PASSWORD",
  });
  if (result.status !== "ISSUED") {
    throw new Error(`Emergency prerequisite session issuance failed: ${JSON.stringify(result)}`);
  }
  return result;
}

try {
  await client.query(
    `INSERT INTO "User" ("id", "email", "name", "role", "updatedAt", "lifecycleState")
     VALUES ($1, $2, 'Emergency Admin', 'ADMIN', $3, 'ACTIVE')`,
    [userId, email, now],
  );
  await client.query(
    `INSERT INTO "AdministratorMfaMethod"
       ("id", "userId", "encryptedSecret", "enabledAt", "verifiedAt", "disabledAt", "createdAt", "updatedAt")
     VALUES ($1, $2, 'old-secret', NULL, NULL, $3, $4, $4)`,
    [randomUUID(), userId, new Date(issuedAt.getTime() - 60_000), issuedAt],
  );
  await client.query(
    `INSERT INTO "AdministratorRecoveryCode" ("id", "userId", "codeHash", "createdAt")
     VALUES ($1, $2, 'emergency-old-recovery-hash', $3)`,
    [randomUUID(), userId, issuedAt],
  );
  await client.query(
    `INSERT INTO "MfaChallenge"
       ("id", "userId", "purpose", "tokenHash", "expiresAt", "createdAt")
     VALUES ($1, $2, 'ENROLLMENT', 'emergency-old-challenge-hash', $3, $4)`,
    [randomUUID(), userId, new Date(now.getTime() + 60_000), issuedAt],
  );
  await client.query(
    `INSERT INTO "EmergencyMfaEnrollmentAuthorization"
       ("id", "userId", "tokenHash", "createdAt", "expiresAt", "recoveryReason",
        "operatorIdentity", "ownerKeyVersion", "deploymentEnvironment")
     VALUES ($1, $2, $3, $4, $5, 'owner recovery', 'deployment-operator', 7, 'production')`,
    [
      authorizationId,
      userId,
      sessionTokens.hash(emergencyToken),
      issuedAt,
      new Date(now.getTime() + 10 * 60_000),
    ],
  );

  const currentSession = await issueCurrentSession();

  await client.query(`
    CREATE FUNCTION "identity_fail_emergency_session_insert"()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW."userId" = '${userId}' AND NEW."authenticationMethod" = 'MFA_ENROLLMENT' THEN
        RAISE EXCEPTION 'forced emergency replacement session failure';
      END IF;
      RETURN NEW;
    END;
    $$
  `);
  await client.query(`
    CREATE TRIGGER "identity_fail_emergency_session_insert_trigger"
    BEFORE INSERT ON "Session"
    FOR EACH ROW EXECUTE FUNCTION "identity_fail_emergency_session_insert"()
  `);

  const failed = await capability.enroll({
    sessionToken: currentSession.token,
    emergencyToken,
  });
  if (failed.status !== "FAILED" || failed.code !== "PERSISTENCE_UNAVAILABLE") {
    throw new Error(`Forced emergency enrollment failure was not typed: ${JSON.stringify(failed)}`);
  }

  const rollbackAuthorization = await client.query<{ consumedAt: Date | null }>(
    `SELECT "consumedAt" FROM "EmergencyMfaEnrollmentAuthorization" WHERE "id" = $1`,
    [authorizationId],
  );
  const rollbackMfa = await client.query<{
    encryptedSecret: string | null;
    enabledAt: Date | null;
    verifiedAt: Date | null;
    disabledAt: Date | null;
  }>(
    `SELECT "encryptedSecret", "enabledAt", "verifiedAt", "disabledAt"
       FROM "AdministratorMfaMethod" WHERE "userId" = $1`,
    [userId],
  );
  const rollbackCodes = await client.query<{ codeHash: string }>(
    `SELECT "codeHash" FROM "AdministratorRecoveryCode" WHERE "userId" = $1`,
    [userId],
  );
  const rollbackChallenges = await client.query(
    `SELECT "id" FROM "MfaChallenge" WHERE "userId" = $1`,
    [userId],
  );
  const rollbackSessions = await client.query<{
    authenticationMethod: string;
    revokedAt: Date | null;
  }>(
    `SELECT "authenticationMethod", "revokedAt" FROM "Session" WHERE "userId" = $1`,
    [userId],
  );

  if (
    rollbackAuthorization.rows[0]?.consumedAt !== null ||
    rollbackMfa.rows[0]?.encryptedSecret !== "old-secret" ||
    rollbackMfa.rows[0]?.enabledAt !== null ||
    rollbackMfa.rows[0]?.verifiedAt !== null ||
    rollbackCodes.rowCount !== 1 ||
    rollbackCodes.rows[0]?.codeHash !== "emergency-old-recovery-hash" ||
    rollbackChallenges.rowCount !== 1 ||
    rollbackSessions.rowCount !== 1 ||
    rollbackSessions.rows[0]?.revokedAt !== null ||
    rollbackSessions.rows.some((row) => row.authenticationMethod === "MFA_ENROLLMENT")
  ) {
    throw new Error("Emergency enrollment did not roll the entire Identity transition back.");
  }

  await client.query(
    `DROP TRIGGER "identity_fail_emergency_session_insert_trigger" ON "Session"`,
  );
  await client.query(`DROP FUNCTION "identity_fail_emergency_session_insert"()`);

  const enrolled = await capability.enroll({
    sessionToken: currentSession.token,
    emergencyToken,
  });
  if (
    enrolled.status !== "ENROLLED" ||
    enrolled.userId !== userId ||
    enrolled.recoveryCodes.length !== 10 ||
    enrolled.auditContext.authorizationId !== authorizationId ||
    enrolled.auditContext.ownerKeyVersion !== 7 ||
    enrolled.auditContext.deploymentEnvironment !== "production"
  ) {
    throw new Error(`Emergency enrollment result mismatch: ${JSON.stringify(enrolled)}`);
  }

  const authorization = await client.query<{ consumedAt: Date | null }>(
    `SELECT "consumedAt" FROM "EmergencyMfaEnrollmentAuthorization" WHERE "id" = $1`,
    [authorizationId],
  );
  const mfa = await client.query<{
    encryptedSecret: string | null;
    pendingExpiresAt: Date | null;
    enabledAt: Date | null;
    verifiedAt: Date | null;
    disabledAt: Date | null;
  }>(
    `SELECT "encryptedSecret", "pendingExpiresAt", "enabledAt", "verifiedAt", "disabledAt"
       FROM "AdministratorMfaMethod" WHERE "userId" = $1`,
    [userId],
  );
  const codes = await client.query<{ codeHash: string; usedAt: Date | null }>(
    `SELECT "codeHash", "usedAt" FROM "AdministratorRecoveryCode" WHERE "userId" = $1`,
    [userId],
  );
  const challenges = await client.query(
    `SELECT "id" FROM "MfaChallenge" WHERE "userId" = $1`,
    [userId],
  );
  const sessions = await client.query<{
    tokenHash: string;
    expiresAt: Date;
    absoluteExpiresAt: Date;
    mfaVerifiedAt: Date | null;
    recentAuthenticatedAt: Date | null;
    authenticationMethod: string;
    assuranceLevel: string;
    revokedAt: Date | null;
    revocationReason: string | null;
  }>(
    `SELECT "tokenHash", "expiresAt", "absoluteExpiresAt", "mfaVerifiedAt",
            "recentAuthenticatedAt", "authenticationMethod", "assuranceLevel",
            "revokedAt", "revocationReason"
       FROM "Session" WHERE "userId" = $1`,
    [userId],
  );

  const replacement = sessions.rows.find(
    (row) => row.tokenHash === sessionTokens.hash(enrolled.replacementSessionToken),
  );
  const old = sessions.rows.find((row) => row.tokenHash !== replacement?.tokenHash);
  const expectedExpiry = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  if (
    authorization.rows[0]?.consumedAt?.getTime() !== now.getTime() ||
    mfa.rows[0]?.encryptedSecret !== null ||
    mfa.rows[0]?.pendingExpiresAt !== null ||
    mfa.rows[0]?.enabledAt?.getTime() !== now.getTime() ||
    mfa.rows[0]?.verifiedAt?.getTime() !== now.getTime() ||
    mfa.rows[0]?.disabledAt !== null ||
    codes.rowCount !== 10 ||
    codes.rows.some((row) => row.usedAt !== null) ||
    challenges.rowCount !== 0 ||
    !old ||
    old.revokedAt?.getTime() !== now.getTime() ||
    old.revocationReason !== "MFA_EMERGENCY_ENROLLED" ||
    !replacement ||
    replacement.revokedAt !== null ||
    replacement.authenticationMethod !== "MFA_ENROLLMENT" ||
    replacement.assuranceLevel !== "RECENTLY_AUTHENTICATED" ||
    replacement.mfaVerifiedAt?.getTime() !== now.getTime() ||
    replacement.recentAuthenticatedAt?.getTime() !== now.getTime() ||
    replacement.expiresAt.getTime() !== expectedExpiry.getTime() ||
    replacement.absoluteExpiresAt.getTime() !== expectedExpiry.getTime()
  ) {
    throw new Error("Emergency enrollment persistence state mismatch.");
  }

  const replacementValidation = await sessionValidation.validate(
    enrolled.replacementSessionToken,
  );
  if (replacementValidation.status !== "VALID") {
    throw new Error(`Replacement emergency session is invalid: ${JSON.stringify(replacementValidation)}`);
  }

  const replay = await capability.enroll({
    sessionToken: enrolled.replacementSessionToken,
    emergencyToken,
  });
  if (
    replay.status !== "INVALID" ||
    replay.code !== "INVALID_EMERGENCY_ENROLLMENT"
  ) {
    throw new Error(`Consumed emergency authorization replayed: ${JSON.stringify(replay)}`);
  }

  console.log("Identity emergency MFA enrollment certification GREEN");
} finally {
  await client
    .query(`DROP TRIGGER IF EXISTS "identity_fail_emergency_session_insert_trigger" ON "Session"`)
    .catch(() => undefined);
  await client
    .query(`DROP FUNCTION IF EXISTS "identity_fail_emergency_session_insert"()`)
    .catch(() => undefined);
  await client.end();
}

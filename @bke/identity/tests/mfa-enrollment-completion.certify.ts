import { Client } from "pg";
import { createIdentityMfaEnrollmentCompletionCapability } from "../logic/mfa-enrollment-completion";
import { createIdentityMfaEnrollmentStartCapability } from "../logic/mfa-enrollment-start";
import { createHmacEmailMfaChallengeMaterialProvider } from "../providers/hmac-email-mfa-challenge-material-provider";
import { createHmacEmailMfaProofProvider } from "../providers/hmac-email-mfa-proof-provider";
import { createHmacMfaRecoveryCodeProvider } from "../providers/hmac-mfa-recovery-code-provider";
import { createHmacSessionTokenProvider } from "../providers/hmac-session-token-provider";
import { createIdentitySessionIssuanceCapability } from "../logic/session-issuance";
import { createPostgresIdentityMfaEnrollmentCompletionRepository } from "../prisma/repositories/postgres-mfa-enrollment-completion-repository";
import { createPostgresIdentityMfaEnrollmentStartRepository } from "../prisma/repositories/postgres-mfa-enrollment-start-repository";
import { createPostgresIdentitySessionRepository } from "../prisma/repositories/postgres-session-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for MFA enrollment completion certification.");
}

const now = new Date("2026-08-31T06:00:00.000Z");
const sessionSecret = "identity-mfa-completion-cert-session-secret";
const mfaEncryptionKey = "identity-mfa-completion-cert-encryption-key";
const challengeMaterialProvider = createHmacEmailMfaChallengeMaterialProvider(
  sessionSecret,
  mfaEncryptionKey,
);
const proofProvider = createHmacEmailMfaProofProvider(
  sessionSecret,
  mfaEncryptionKey,
);
const recoveryCodeProvider = createHmacMfaRecoveryCodeProvider(
  sessionSecret,
  mfaEncryptionKey,
);
const startRepository = createPostgresIdentityMfaEnrollmentStartRepository(
  connectionString,
);
const completionRepository =
  createPostgresIdentityMfaEnrollmentCompletionRepository(connectionString);
const sessionRepository = createPostgresIdentitySessionRepository(connectionString);
const sessionTokenProvider = createHmacSessionTokenProvider(sessionSecret);
const start = createIdentityMfaEnrollmentStartCapability(
  startRepository,
  challengeMaterialProvider,
  () => now,
);
const complete = createIdentityMfaEnrollmentCompletionCapability(
  completionRepository,
  proofProvider,
  recoveryCodeProvider,
  () => now,
);
const issueSession = createIdentitySessionIssuanceCapability(
  sessionRepository,
  sessionTokenProvider,
  () => now,
);
const client = new Client({ connectionString });
await client.connect();

async function createAdmin(id: string) {
  await client.query(
    `INSERT INTO "User" ("id", "email", "name", "role", "updatedAt", "lifecycleState")
     VALUES ($1, $2, $3, 'ADMIN', $4, 'ACTIVE')`,
    [id, `${id}@example.com`, id, now],
  );
}

async function issueAdminSession(userId: string) {
  const result = await issueSession.issue({
    userId,
    authenticationMethod: "PASSWORD",
  });
  if (result.status !== "ISSUED") {
    throw new Error(`Could not issue certification session: ${JSON.stringify(result)}`);
  }
  return result.session.id;
}

try {
  // Happy path: start -> complete -> rotate recovery codes -> revoke active sessions.
  await createAdmin("mfa-complete-admin");
  const sessionA = await issueAdminSession("mfa-complete-admin");
  const sessionB = await issueAdminSession("mfa-complete-admin");

  const enrollment = await start.start({ userId: "mfa-complete-admin" });
  if (enrollment.status !== "STARTED") {
    throw new Error(`Enrollment start failed: ${JSON.stringify(enrollment)}`);
  }

  const result = await complete.complete({
    userId: "mfa-complete-admin",
    challengeToken: enrollment.challengeToken,
    code: enrollment.delivery.code,
  });
  if (
    result.status !== "COMPLETED" ||
    result.verificationMethod !== "EMAIL_OTP" ||
    result.recoveryCodes.length !== 10
  ) {
    throw new Error(`Enrollment completion failed: ${JSON.stringify(result)}`);
  }

  const method = await client.query<{
    encryptedSecret: string | null;
    pendingExpiresAt: Date | null;
    enabledAt: Date | null;
    verifiedAt: Date | null;
    disabledAt: Date | null;
  }>(
    `SELECT "encryptedSecret", "pendingExpiresAt", "enabledAt", "verifiedAt", "disabledAt"
       FROM "AdministratorMfaMethod"
      WHERE "userId" = 'mfa-complete-admin'`,
  );
  const enabledMethod = method.rows[0];
  if (
    !enabledMethod ||
    enabledMethod.encryptedSecret !== null ||
    enabledMethod.pendingExpiresAt !== null ||
    enabledMethod.enabledAt?.getTime() !== now.getTime() ||
    enabledMethod.verifiedAt?.getTime() !== now.getTime() ||
    enabledMethod.disabledAt !== null
  ) {
    throw new Error("Completed MFA method state is invalid.");
  }

  const challenge = await client.query<{ consumedAt: Date | null }>(
    `SELECT "consumedAt"
       FROM "MfaChallenge"
      WHERE "userId" = 'mfa-complete-admin'
        AND "purpose" = 'ENROLLMENT'`,
  );
  if (challenge.rows[0]?.consumedAt?.getTime() !== now.getTime()) {
    throw new Error("Enrollment challenge was not consumed atomically.");
  }

  const storedRecovery = await client.query<{ codeHash: string; usedAt: Date | null }>(
    `SELECT "codeHash", "usedAt"
       FROM "AdministratorRecoveryCode"
      WHERE "userId" = 'mfa-complete-admin'
      ORDER BY "codeHash"`,
  );
  if (storedRecovery.rows.length !== 10 || storedRecovery.rows.some((row) => row.usedAt)) {
    throw new Error("Completion did not create exactly ten unused recovery codes.");
  }
  const expectedHashes = result.recoveryCodes
    .map((value) => proofProvider.hashRecoveryCode(value))
    .sort();
  const actualHashes = storedRecovery.rows.map((row) => row.codeHash).sort();
  if (JSON.stringify(expectedHashes) !== JSON.stringify(actualHashes)) {
    throw new Error("Returned recovery codes do not map exactly to persisted HMAC hashes.");
  }
  for (const raw of result.recoveryCodes) {
    if (actualHashes.includes(raw)) {
      throw new Error("Raw recovery code leaked into PostgreSQL.");
    }
  }

  const sessions = await client.query<{
    id: string;
    revokedAt: Date | null;
    revocationReason: string | null;
  }>(
    `SELECT "id", "revokedAt", "revocationReason"
       FROM "Session"
      WHERE "id" = ANY($1::text[])
      ORDER BY "id"`,
    [[sessionA, sessionB]],
  );
  if (
    sessions.rows.length !== 2 ||
    sessions.rows.some(
      (row) =>
        row.revokedAt?.getTime() !== now.getTime() ||
        row.revocationReason !== "MFA_ENROLLED",
    )
  ) {
    throw new Error("Active sessions were not revoked by MFA completion.");
  }

  const replay = await complete.complete({
    userId: "mfa-complete-admin",
    challengeToken: enrollment.challengeToken,
    code: enrollment.delivery.code,
  });
  if (replay.status !== "INVALID" || replay.code !== "INVALID_CHALLENGE") {
    throw new Error(`Consumed enrollment challenge was reusable: ${JSON.stringify(replay)}`);
  }

  // Wrong proof burns one attempt but leaves enrollment pending and sessions alive.
  await createAdmin("mfa-complete-wrong-code");
  const wrongSession = await issueAdminSession("mfa-complete-wrong-code");
  const wrongEnrollment = await start.start({ userId: "mfa-complete-wrong-code" });
  if (wrongEnrollment.status !== "STARTED") throw new Error("Wrong-code enrollment did not start.");
  const wrong = await complete.complete({
    userId: "mfa-complete-wrong-code",
    challengeToken: wrongEnrollment.challengeToken,
    code: "000000",
  });
  if (wrong.status !== "INVALID" || wrong.code !== "INVALID_CODE") {
    throw new Error(`Wrong enrollment code did not fail correctly: ${JSON.stringify(wrong)}`);
  }
  const wrongState = await client.query<{
    attemptCount: number;
    consumedAt: Date | null;
    enabledAt: Date | null;
    pendingExpiresAt: Date | null;
    revokedAt: Date | null;
  }>(
    `SELECT c."attemptCount", c."consumedAt", m."enabledAt", m."pendingExpiresAt", s."revokedAt"
       FROM "MfaChallenge" c
       JOIN "AdministratorMfaMethod" m ON m."userId" = c."userId"
       JOIN "Session" s ON s."userId" = c."userId" AND s."id" = $1
      WHERE c."userId" = 'mfa-complete-wrong-code'
        AND c."purpose" = 'ENROLLMENT'`,
    [wrongSession],
  );
  const wrongRow = wrongState.rows[0];
  if (
    !wrongRow ||
    wrongRow.attemptCount !== 1 ||
    wrongRow.consumedAt !== null ||
    wrongRow.enabledAt !== null ||
    !wrongRow.pendingExpiresAt ||
    wrongRow.revokedAt !== null
  ) {
    throw new Error("Wrong-code failure mutated enrollment/session state incorrectly.");
  }

  // Preserve V1 helper compatibility: an unused pre-existing recovery code may prove enrollment.
  await createAdmin("mfa-complete-recovery");
  const recoveryEnrollment = await start.start({ userId: "mfa-complete-recovery" });
  if (recoveryEnrollment.status !== "STARTED") throw new Error("Recovery enrollment did not start.");
  const oldRecoveryRaw = "ABCDE-FGHIJ-KLMNO-P";
  await client.query(
    `INSERT INTO "AdministratorRecoveryCode" ("id", "userId", "codeHash")
     VALUES ($1, 'mfa-complete-recovery', $2)`,
    ["old-recovery-cert", proofProvider.hashRecoveryCode(oldRecoveryRaw)],
  );
  const recoveryResult = await complete.complete({
    userId: "mfa-complete-recovery",
    challengeToken: recoveryEnrollment.challengeToken,
    code: oldRecoveryRaw,
  });
  if (
    recoveryResult.status !== "COMPLETED" ||
    recoveryResult.verificationMethod !== "RECOVERY_CODE"
  ) {
    throw new Error(`Recovery fallback was not preserved: ${JSON.stringify(recoveryResult)}`);
  }
  const oldRecoveryStillPresent = await client.query(
    `SELECT 1 FROM "AdministratorRecoveryCode" WHERE "id" = 'old-recovery-cert'`,
  );
  if ((oldRecoveryStillPresent.rowCount ?? 0) !== 0) {
    throw new Error("Old recovery code survived recovery-code rotation.");
  }

  // Adversarial rollback: duplicate replacement hashes force a unique violation mid-transaction.
  await createAdmin("mfa-complete-rollback");
  const rollbackSession = await issueAdminSession("mfa-complete-rollback");
  const rollbackEnrollment = await start.start({ userId: "mfa-complete-rollback" });
  if (rollbackEnrollment.status !== "STARTED") throw new Error("Rollback enrollment did not start.");

  const duplicateRecoveryProvider = {
    issue: () =>
      Array.from({ length: 10 }, (_, index) => ({
        value: `ROLLBACK-${index}`,
        hash: "duplicate-recovery-hash",
      })),
  };
  const rollbackCapability = createIdentityMfaEnrollmentCompletionCapability(
    completionRepository,
    proofProvider,
    duplicateRecoveryProvider,
    () => now,
  );
  const rollbackResult = await rollbackCapability.complete({
    userId: "mfa-complete-rollback",
    challengeToken: rollbackEnrollment.challengeToken,
    code: rollbackEnrollment.delivery.code,
  });
  if (
    rollbackResult.status !== "FAILED" ||
    rollbackResult.code !== "PERSISTENCE_UNAVAILABLE"
  ) {
    throw new Error(`Forced transaction failure did not fail closed: ${JSON.stringify(rollbackResult)}`);
  }

  const rollbackState = await client.query<{
    consumedAt: Date | null;
    enabledAt: Date | null;
    pendingExpiresAt: Date | null;
    revokedAt: Date | null;
    recoveryCount: string;
  }>(
    `SELECT
       c."consumedAt",
       m."enabledAt",
       m."pendingExpiresAt",
       s."revokedAt",
       (SELECT count(*)::text FROM "AdministratorRecoveryCode" r WHERE r."userId" = c."userId") AS "recoveryCount"
     FROM "MfaChallenge" c
     JOIN "AdministratorMfaMethod" m ON m."userId" = c."userId"
     JOIN "Session" s ON s."userId" = c."userId" AND s."id" = $1
     WHERE c."userId" = 'mfa-complete-rollback'
       AND c."purpose" = 'ENROLLMENT'`,
    [rollbackSession],
  );
  const rolledBack = rollbackState.rows[0];
  if (
    !rolledBack ||
    rolledBack.consumedAt !== null ||
    rolledBack.enabledAt !== null ||
    !rolledBack.pendingExpiresAt ||
    rolledBack.revokedAt !== null ||
    rolledBack.recoveryCount !== "0"
  ) {
    throw new Error("Failed completion transaction left partial MFA/session/recovery state.");
  }

  console.log("Identity MFA enrollment completion certification GREEN");
} finally {
  await client.end();
}

import { createHash, createHmac, randomUUID } from "node:crypto";
import { Client } from "pg";
import { createIdentityMfaRecoveryRegenerationCapability } from "../logic/mfa-recovery-regeneration";
import { createHmacMfaRecoveryCodeProvider } from "../providers/hmac-mfa-recovery-code-provider";
import { createHmacSessionTokenProvider } from "../providers/hmac-session-token-provider";
import { createIdentitySessionIssuanceCapability } from "../logic/session-issuance";
import { createIdentitySessionValidationCapability } from "../logic/session-validation";
import { createPostgresIdentityMfaRecoveryRegenerationRepository } from "../prisma/repositories/postgres-mfa-recovery-regeneration-repository";
import { createPostgresIdentitySessionRepository } from "../prisma/repositories/postgres-session-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for MFA recovery regeneration certification.");

const now = new Date("2026-09-01T09:00:00.000Z");
const issuedAt = new Date(now.getTime() - 5 * 60_000);
const userId = "mfa-recovery-regen-admin";
const sessionSecret = "identity-mfa-recovery-regen-session-secret";
const mfaEncryptionKey = "identity-mfa-recovery-regen-mfa-key";
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
const repository = createPostgresIdentityMfaRecoveryRegenerationRepository(
  connectionString,
);
const capability = createIdentityMfaRecoveryRegenerationCapability(
  repository,
  sessionValidation,
  recoveryProvider,
  () => now,
);
const client = new Client({ connectionString });
await client.connect();

const mfaKey = createHash("sha256").update(mfaEncryptionKey).digest();
const hashRecoveryCode = (code: string) =>
  createHmac("sha256", mfaKey)
    .update(code.replace(/[^A-Z2-7]/gi, "").toUpperCase())
    .digest("hex");

async function issueSession() {
  const issuance = createIdentitySessionIssuanceCapability(
    sessionRepository,
    sessionTokens,
    () => issuedAt,
  );
  const result = await issuance.issue({
    userId,
    authenticationMethod: "PASSWORD_EMAIL_OTP",
  });
  if (result.status !== "ISSUED") {
    throw new Error(`Admin session issuance failed: ${JSON.stringify(result)}`);
  }
  return result;
}

try {
  await client.query(
    `INSERT INTO "User" ("id", "email", "name", "role", "updatedAt", "lifecycleState")
     VALUES ($1, $2, 'Recovery Admin', 'ADMIN', $3, 'ACTIVE')`,
    [userId, "mfa-recovery-regen-admin@example.com", now],
  );
  await client.query(
    `INSERT INTO "AdministratorMfaMethod"
       ("id", "userId", "enabledAt", "verifiedAt", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $3, $3, $3)`,
    [randomUUID(), userId, issuedAt],
  );
  await client.query(
    `INSERT INTO "AdministratorRecoveryCode" ("id", "userId", "codeHash", "usedAt")
     VALUES
       ($1, $3, 'old-recovery-hash-1', NULL),
       ($2, $3, 'old-recovery-hash-2', $4)`,
    [randomUUID(), randomUUID(), userId, new Date(issuedAt.getTime() - 60_000)],
  );

  const currentSession = await issueSession();
  const secondSession = await issueSession();

  await client.query(`
    CREATE FUNCTION "identity_fail_recovery_regen_session_revoke"()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW."userId" = '${userId}' AND NEW."revocationReason" = 'RECOVERY_CODES_REGENERATED' THEN
        RAISE EXCEPTION 'forced recovery regeneration revocation failure';
      END IF;
      RETURN NEW;
    END;
    $$
  `);
  await client.query(`
    CREATE TRIGGER "identity_fail_recovery_regen_session_revoke_trigger"
    BEFORE UPDATE ON "Session"
    FOR EACH ROW EXECUTE FUNCTION "identity_fail_recovery_regen_session_revoke"()
  `);

  const failed = await capability.regenerate({ sessionToken: currentSession.token });
  if (failed.status !== "FAILED" || failed.code !== "PERSISTENCE_UNAVAILABLE") {
    throw new Error(`Forced recovery regeneration failure was not typed: ${JSON.stringify(failed)}`);
  }
  const rollbackCodes = await client.query<{ codeHash: string }>(
    `SELECT "codeHash" FROM "AdministratorRecoveryCode" WHERE "userId" = $1 ORDER BY "codeHash"`,
    [userId],
  );
  const rollbackSessions = await client.query<{ revokedAt: Date | null }>(
    `SELECT "revokedAt" FROM "Session" WHERE "userId" = $1`,
    [userId],
  );
  if (
    rollbackCodes.rowCount !== 2 ||
    !rollbackCodes.rows.some((row) => row.codeHash === "old-recovery-hash-1") ||
    !rollbackCodes.rows.some((row) => row.codeHash === "old-recovery-hash-2") ||
    rollbackSessions.rows.some((row) => row.revokedAt !== null)
  ) {
    throw new Error("Recovery regeneration did not roll code replacement and session revocation back together.");
  }

  await client.query(
    `DROP TRIGGER "identity_fail_recovery_regen_session_revoke_trigger" ON "Session"`,
  );
  await client.query(`DROP FUNCTION "identity_fail_recovery_regen_session_revoke"()`);

  const regenerated = await capability.regenerate({ sessionToken: currentSession.token });
  if (
    regenerated.status !== "REGENERATED" ||
    regenerated.userId !== userId ||
    regenerated.replacementAuthenticationMethod !== "PASSWORD_EMAIL_OTP" ||
    regenerated.recoveryCodes.length !== 10
  ) {
    throw new Error(`Recovery regeneration result mismatch: ${JSON.stringify(regenerated)}`);
  }

  const storedCodes = await client.query<{ codeHash: string; usedAt: Date | null }>(
    `SELECT "codeHash", "usedAt" FROM "AdministratorRecoveryCode" WHERE "userId" = $1`,
    [userId],
  );
  const expectedHashes = new Set(regenerated.recoveryCodes.map(hashRecoveryCode));
  if (
    storedCodes.rowCount !== 10 ||
    storedCodes.rows.some(
      (row) => row.usedAt !== null || !expectedHashes.has(row.codeHash),
    ) ||
    storedCodes.rows.some((row) => regenerated.recoveryCodes.includes(row.codeHash))
  ) {
    throw new Error("Recovery regeneration did not persist exactly the 10 new hashed codes.");
  }

  const revokedSessions = await client.query<{
    revokedAt: Date | null;
    revocationReason: string | null;
  }>(
    `SELECT "revokedAt", "revocationReason" FROM "Session" WHERE "userId" = $1`,
    [userId],
  );
  if (
    revokedSessions.rowCount !== 2 ||
    revokedSessions.rows.some(
      (row) =>
        row.revokedAt?.getTime() !== now.getTime() ||
        row.revocationReason !== "RECOVERY_CODES_REGENERATED",
    )
  ) {
    throw new Error("Recovery regeneration did not revoke every active session consistently.");
  }

  for (const token of [currentSession.token, secondSession.token]) {
    const validation = await sessionValidation.validate(token);
    if (validation.status !== "INVALID" || validation.code !== "SESSION_REVOKED") {
      throw new Error(`Old session survived recovery regeneration: ${JSON.stringify(validation)}`);
    }
  }

  console.log("Identity MFA recovery regeneration certification GREEN");
} finally {
  await client
    .query(`DROP TRIGGER IF EXISTS "identity_fail_recovery_regen_session_revoke_trigger" ON "Session"`)
    .catch(() => undefined);
  await client
    .query(`DROP FUNCTION IF EXISTS "identity_fail_recovery_regen_session_revoke"()`)
    .catch(() => undefined);
  await client.end();
}

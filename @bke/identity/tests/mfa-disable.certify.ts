import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { createIdentityMfaDisableCapability } from "../logic/mfa-disable";
import { createHmacSessionTokenProvider } from "../providers/hmac-session-token-provider";
import { createIdentitySessionIssuanceCapability } from "../logic/session-issuance";
import { createPostgresIdentityMfaDisableRepository } from "../prisma/repositories/postgres-mfa-disable-repository";
import { createPostgresIdentitySessionRepository } from "../prisma/repositories/postgres-session-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Identity MFA disable certification.");
}

const now = new Date("2026-08-31T07:00:00.000Z");
const sessionSecret = "identity-mfa-disable-cert-session-secret";
const repository = createPostgresIdentityMfaDisableRepository(connectionString);
const capability = createIdentityMfaDisableCapability(repository, () => now);
const sessionRepository = createPostgresIdentitySessionRepository(connectionString);
const sessionTokens = createHmacSessionTokenProvider(sessionSecret);
const issueSession = createIdentitySessionIssuanceCapability(
  sessionRepository,
  sessionTokens,
  () => new Date(now.getTime() - 60_000),
);
const client = new Client({ connectionString });
await client.connect();

async function createUser(id: string, role: "ADMIN" | "CUSTOMER") {
  await client.query(
    `INSERT INTO "User" ("id", "email", "name", "role", "updatedAt", "lifecycleState")
     VALUES ($1, $2, $3, $4::"IdentityRole", $5, 'ACTIVE')`,
    [id, `${id}@example.com`, id, role, now],
  );
}

async function createEnabledAdmin(id: string) {
  await createUser(id, "ADMIN");
  await client.query(
    `INSERT INTO "AdministratorMfaMethod"
       ("id", "userId", "encryptedSecret", "enabledAt", "verifiedAt", "pendingExpiresAt", "updatedAt")
     VALUES ($1, $2, NULL, $3, $3, NULL, $3)`,
    [randomUUID(), id, new Date(now.getTime() - 60 * 60_000)],
  );
  await client.query(
    `INSERT INTO "AdministratorRecoveryCode" ("id", "userId", "codeHash")
     VALUES ($1, $2, $3)`,
    [randomUUID(), id, `${id}-recovery-hash`],
  );
  await client.query(
    `INSERT INTO "MfaChallenge"
       ("id", "userId", "purpose", "tokenHash", "codeHash", "expiresAt")
     VALUES ($1, $2, 'LOGIN', $3, $4, $5)`,
    [
      randomUUID(),
      id,
      `${id}-challenge-token-hash`,
      `${id}-challenge-code-hash`,
      new Date(now.getTime() + 10 * 60_000),
    ],
  );
  const session = await issueSession.issue({
    userId: id,
    authenticationMethod: "PASSWORD_EMAIL_OTP",
  });
  if (session.status !== "ISSUED") {
    throw new Error(`Could not issue certification session: ${JSON.stringify(session)}`);
  }
  return session.session.id;
}

async function stateFor(userId: string, sessionId: string) {
  const result = await client.query<{
    enabledAt: Date | null;
    disabledAt: Date | null;
    pendingExpiresAt: Date | null;
    recoveryCount: string;
    challengeCount: string;
    revokedAt: Date | null;
    revocationReason: string | null;
  }>(
    `SELECT
       m."enabledAt",
       m."disabledAt",
       m."pendingExpiresAt",
       (SELECT count(*)::text FROM "AdministratorRecoveryCode" r WHERE r."userId" = $1) AS "recoveryCount",
       (SELECT count(*)::text FROM "MfaChallenge" c WHERE c."userId" = $1) AS "challengeCount",
       s."revokedAt",
       s."revocationReason"
     FROM "AdministratorMfaMethod" m
     JOIN "Session" s ON s."id" = $2
     WHERE m."userId" = $1`,
    [userId, sessionId],
  );
  return result.rows[0];
}

try {
  // Happy path: method disable, recovery/challenge purge and session revocation commit together.
  const happySession = await createEnabledAdmin("mfa-disable-admin");
  const disabled = await capability.disable({ userId: "mfa-disable-admin" });
  if (
    disabled.status !== "DISABLED" ||
    disabled.disabledAt.getTime() !== now.getTime() ||
    disabled.enrollmentRequired !== true
  ) {
    throw new Error(`MFA disable failed: ${JSON.stringify(disabled)}`);
  }

  const happy = await stateFor("mfa-disable-admin", happySession);
  if (
    !happy ||
    happy.enabledAt !== null ||
    happy.disabledAt?.getTime() !== now.getTime() ||
    happy.pendingExpiresAt !== null ||
    happy.recoveryCount !== "0" ||
    happy.challengeCount !== "0" ||
    happy.revokedAt?.getTime() !== now.getTime() ||
    happy.revocationReason !== "MFA_DISABLED"
  ) {
    throw new Error(`MFA disable durable state is invalid: ${JSON.stringify(happy)}`);
  }

  const repeated = await capability.disable({ userId: "mfa-disable-admin" });
  if (repeated.status !== "INVALID" || repeated.code !== "MFA_NOT_ENABLED") {
    throw new Error(`Repeated disable did not fail closed: ${JSON.stringify(repeated)}`);
  }

  // Authority failures must not manufacture state transitions.
  await createUser("mfa-disable-customer", "CUSTOMER");
  const customer = await capability.disable({ userId: "mfa-disable-customer" });
  if (customer.status !== "INVALID" || customer.code !== "FORBIDDEN") {
    throw new Error(`Customer disabled admin MFA: ${JSON.stringify(customer)}`);
  }
  const missing = await capability.disable({ userId: "mfa-disable-missing" });
  if (missing.status !== "INVALID" || missing.code !== "NOT_FOUND") {
    throw new Error(`Missing principal did not fail closed: ${JSON.stringify(missing)}`);
  }

  // Adversarial rollback: force the last session-revocation step to throw.
  const rollbackSession = await createEnabledAdmin("mfa-disable-rollback");
  await client.query(`
    CREATE OR REPLACE FUNCTION "cert_fail_mfa_disable_session_revoke"()
    RETURNS trigger AS $$
    BEGIN
      IF NEW."revocationReason" = 'MFA_DISABLED' AND OLD."userId" = 'mfa-disable-rollback' THEN
        RAISE EXCEPTION 'forced MFA disable certification failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await client.query(`
    CREATE TRIGGER "cert_fail_mfa_disable_session_revoke_trigger"
    BEFORE UPDATE ON "Session"
    FOR EACH ROW EXECUTE FUNCTION "cert_fail_mfa_disable_session_revoke"();
  `);

  const failed = await capability.disable({ userId: "mfa-disable-rollback" });
  if (failed.status !== "FAILED" || failed.code !== "PERSISTENCE_UNAVAILABLE") {
    throw new Error(`Forced transaction failure did not fail closed: ${JSON.stringify(failed)}`);
  }

  const rollback = await stateFor("mfa-disable-rollback", rollbackSession);
  if (
    !rollback ||
    !rollback.enabledAt ||
    rollback.disabledAt !== null ||
    rollback.recoveryCount !== "1" ||
    rollback.challengeCount !== "1" ||
    rollback.revokedAt !== null ||
    rollback.revocationReason !== null
  ) {
    throw new Error(`MFA disable transaction leaked partial state: ${JSON.stringify(rollback)}`);
  }

  await client.query(
    `DROP TRIGGER "cert_fail_mfa_disable_session_revoke_trigger" ON "Session"`,
  );
  await client.query(`DROP FUNCTION "cert_fail_mfa_disable_session_revoke"()`);

  console.log("Identity MFA disable certification GREEN");
} finally {
  await client.query(
    `DROP TRIGGER IF EXISTS "cert_fail_mfa_disable_session_revoke_trigger" ON "Session"`,
  ).catch(() => undefined);
  await client.query(
    `DROP FUNCTION IF EXISTS "cert_fail_mfa_disable_session_revoke"()`,
  ).catch(() => undefined);
  await client.end();
}

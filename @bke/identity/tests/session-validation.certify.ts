import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { createHmacSessionTokenProvider } from "../providers/hmac-session-token-provider";
import { createIdentitySessionIssuanceCapability } from "../logic/session-issuance";
import { createIdentitySessionValidationCapability } from "../logic/session-validation";
import { createPostgresIdentitySessionRepository } from "../prisma/repositories/postgres-session-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Identity session validation certification.");
}

const issuedAt = new Date("2026-08-31T01:00:00.000Z");
const validationNow = new Date(issuedAt.getTime() + 6 * 60_000);
const sessionSecret = "identity-session-validation-certification-secret";
const repository = createPostgresIdentitySessionRepository(connectionString);
const tokens = createHmacSessionTokenProvider(sessionSecret);
const issuance = createIdentitySessionIssuanceCapability(repository, tokens, () => issuedAt);
const validation = createIdentitySessionValidationCapability(repository, tokens, () => validationNow);
const client = new Client({ connectionString });
await client.connect();

async function createUser(id: string, role: "CUSTOMER" | "ADMIN" = "CUSTOMER") {
  await client.query(
    `INSERT INTO "User" ("id", "email", "name", "role", "updatedAt", "lifecycleState")
     VALUES ($1, $2, $3, $4::"IdentityRole", $5, 'ACTIVE')`,
    [id, `${id}@example.com`, id, role, issuedAt],
  );
}

async function issue(userId: string, method: "PASSWORD" | "PASSWORD_EMAIL_OTP" = "PASSWORD") {
  const result = await issuance.issue({ userId, authenticationMethod: method });
  if (result.status !== "ISSUED") {
    throw new Error(`Session issuance failed for ${userId}: ${JSON.stringify(result)}`);
  }
  return result;
}

try {
  await createUser("session-valid-user");
  const valid = await issue("session-valid-user");
  const validResult = await validation.validate(valid.token);
  if (validResult.status !== "VALID" || validResult.context.principal.id !== "session-valid-user") {
    throw new Error(`Valid session was not recognized: ${JSON.stringify(validResult)}`);
  }

  const stored = await client.query<{ tokenHash: string; lastSeenAt: Date }>(
    `SELECT "tokenHash", "lastSeenAt" FROM "Session" WHERE "id" = $1`,
    [valid.session.id],
  );
  const validRow = stored.rows[0];
  if (!validRow || validRow.tokenHash !== tokens.hash(valid.token) || validRow.tokenHash === valid.token) {
    throw new Error("Session validation token/HMAC boundary certification failed.");
  }
  if (validRow.lastSeenAt.getTime() !== validationNow.getTime()) {
    throw new Error("Session validation did not refresh lastSeenAt after five minutes.");
  }

  const missing = await validation.validate("not-a-real-session-token");
  if (missing.status !== "INVALID" || missing.code !== "SESSION_NOT_FOUND") {
    throw new Error(`Unknown token did not fail closed: ${JSON.stringify(missing)}`);
  }
  const blank = await validation.validate("   ");
  if (blank.status !== "INVALID" || blank.code !== "TOKEN_MISSING") {
    throw new Error(`Blank token did not fail closed: ${JSON.stringify(blank)}`);
  }

  await createUser("session-idle-user");
  const idle = await issue("session-idle-user");
  await client.query(`UPDATE "Session" SET "lastSeenAt" = $2 WHERE "id" = $1`, [
    idle.session.id,
    new Date(validationNow.getTime() - 61 * 60_000),
  ]);
  const idleResult = await validation.validate(idle.token);
  if (idleResult.status !== "INVALID" || idleResult.code !== "IDLE_TIMEOUT") {
    throw new Error(`Idle session did not fail closed: ${JSON.stringify(idleResult)}`);
  }
  const idleRevocation = await client.query<{ revocationReason: string | null }>(
    `SELECT "revocationReason" FROM "Session" WHERE "id" = $1`,
    [idle.session.id],
  );
  if (idleRevocation.rows[0]?.revocationReason !== "IDLE_TIMEOUT") {
    throw new Error("Idle session revocation reason was not persisted.");
  }

  await createUser("session-expired-user");
  const expired = await issue("session-expired-user");
  await client.query(`UPDATE "Session" SET "expiresAt" = $2 WHERE "id" = $1`, [
    expired.session.id,
    new Date(validationNow.getTime() - 1),
  ]);
  const expiredResult = await validation.validate(expired.token);
  if (expiredResult.status !== "INVALID" || expiredResult.code !== "EXPIRED") {
    throw new Error(`Expired session did not fail closed: ${JSON.stringify(expiredResult)}`);
  }

  await createUser("session-suspended-user");
  const suspended = await issue("session-suspended-user");
  await client.query(`UPDATE "User" SET "suspendedAt" = $2 WHERE "id" = $1`, [
    "session-suspended-user",
    validationNow,
  ]);
  const suspendedResult = await validation.validate(suspended.token);
  if (suspendedResult.status !== "INVALID" || suspendedResult.code !== "ACCOUNT_SUSPENDED") {
    throw new Error(`Suspended account session did not fail closed: ${JSON.stringify(suspendedResult)}`);
  }

  await createUser("session-revoked-user");
  const revoked = await issue("session-revoked-user");
  await client.query(
    `UPDATE "Session" SET "revokedAt" = $2, "revocationReason" = 'LOGOUT' WHERE "id" = $1`,
    [revoked.session.id, validationNow],
  );
  const revokedResult = await validation.validate(revoked.token);
  if (revokedResult.status !== "INVALID" || revokedResult.code !== "SESSION_REVOKED") {
    throw new Error(`Revoked session was accepted: ${JSON.stringify(revokedResult)}`);
  }

  await createUser("session-admin-user", "ADMIN");
  await client.query(
    `INSERT INTO "AdministratorMfaMethod"
       ("id", "userId", "enabledAt", "verifiedAt", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $3, $3, $3)`,
    [randomUUID(), "session-admin-user", issuedAt],
  );
  const admin = await issue("session-admin-user", "PASSWORD_EMAIL_OTP");
  const adminResult = await validation.validate(admin.token);
  if (
    adminResult.status !== "VALID" ||
    !adminResult.context.administratorMfaEnabled ||
    !adminResult.context.session.mfaVerifiedAt
  ) {
    throw new Error(`Admin MFA session context was not preserved: ${JSON.stringify(adminResult)}`);
  }

  console.log("Identity session validation certification GREEN");
} finally {
  await client.end();
}

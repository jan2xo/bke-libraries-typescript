import { Client } from "pg";
import { createHmacSessionTokenProvider } from "../providers/hmac-session-token-provider";
import { createIdentitySessionIssuanceCapability } from "../logic/session-issuance";
import { createIdentitySessionTerminationCapability } from "../logic/session-termination";
import { createIdentitySessionValidationCapability } from "../logic/session-validation";
import { createPostgresIdentitySessionRepository } from "../prisma/repositories/postgres-session-repository";
import { createPostgresIdentitySessionTerminationRepository } from "../prisma/repositories/postgres-session-termination-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Identity session termination certification.");
}

const now = new Date("2026-08-31T02:00:00.000Z");
const sessionSecret = "identity-session-termination-certification-secret";
const sessionRepository = createPostgresIdentitySessionRepository(connectionString);
const terminationRepository = createPostgresIdentitySessionTerminationRepository(connectionString);
const tokens = createHmacSessionTokenProvider(sessionSecret);
const issuance = createIdentitySessionIssuanceCapability(sessionRepository, tokens, () => now);
const validation = createIdentitySessionValidationCapability(sessionRepository, tokens, () => now);
const termination = createIdentitySessionTerminationCapability(
  terminationRepository,
  tokens,
  () => now,
);
const client = new Client({ connectionString });
await client.connect();

try {
  await client.query(
    `INSERT INTO "User" ("id", "email", "name", "role", "updatedAt", "lifecycleState")
     VALUES ('termination-user', 'termination-user@example.com', 'Termination User', 'CUSTOMER', $1, 'ACTIVE')`,
    [now],
  );

  const issued = await issuance.issue({
    userId: "termination-user",
    authenticationMethod: "PASSWORD",
  });
  if (issued.status !== "ISSUED") {
    throw new Error(`Unable to issue termination certification session: ${JSON.stringify(issued)}`);
  }

  const before = await validation.validate(issued.token);
  if (before.status !== "VALID") {
    throw new Error(`Session was not valid before termination: ${JSON.stringify(before)}`);
  }

  const terminated = await termination.terminate(issued.token);
  if (terminated.status !== "TERMINATED") {
    throw new Error(`Session termination failed: ${JSON.stringify(terminated)}`);
  }

  const stored = await client.query<{
    tokenHash: string;
    revokedAt: Date | null;
    revocationReason: string | null;
  }>(
    `SELECT "tokenHash", "revokedAt", "revocationReason"
       FROM "Session"
      WHERE "id" = $1`,
    [issued.session.id],
  );
  const row = stored.rows[0];
  if (!row || row.tokenHash !== tokens.hash(issued.token) || row.tokenHash === issued.token) {
    throw new Error("Termination did not preserve the raw-token/HMAC storage boundary.");
  }
  if (!row.revokedAt || row.revocationReason !== "LOGOUT") {
    throw new Error(`Logout revocation was not persisted: ${JSON.stringify(row)}`);
  }

  const after = await validation.validate(issued.token);
  if (after.status !== "INVALID" || after.code !== "SESSION_REVOKED") {
    throw new Error(`Terminated session was still accepted: ${JSON.stringify(after)}`);
  }

  const secondTermination = await termination.terminate(issued.token);
  if (secondTermination.status !== "TERMINATED") {
    throw new Error("Repeated termination was not idempotent.");
  }

  const beforeUnknown = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM "Session" WHERE "revokedAt" IS NULL`,
  );
  const unknown = await termination.terminate("unknown-session-token");
  const afterUnknown = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM "Session" WHERE "revokedAt" IS NULL`,
  );
  if (unknown.status !== "TERMINATED" || beforeUnknown.rows[0]?.count !== afterUnknown.rows[0]?.count) {
    throw new Error("Unknown-token termination leaked state or mutated an unrelated session.");
  }

  const blank = await termination.terminate("   ");
  if (blank.status !== "NO_SESSION") {
    throw new Error(`Blank-token termination was not a no-op: ${JSON.stringify(blank)}`);
  }

  console.log("Identity session termination certification GREEN");
} finally {
  await client.end();
}

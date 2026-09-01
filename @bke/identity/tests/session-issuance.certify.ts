import { createHmac } from "node:crypto";
import { Client } from "pg";
import { createHmacSessionTokenProvider } from "../providers/hmac-session-token-provider";
import { createIdentitySessionIssuanceCapability } from "../logic/session-issuance";
import { createPostgresIdentitySessionRepository } from "../prisma/repositories/postgres-session-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Identity session certification.");
}

const sessionSecret = "identity-session-certification-secret-2026";
const sessions = createIdentitySessionIssuanceCapability(
  createPostgresIdentitySessionRepository(connectionString),
  createHmacSessionTokenProvider(sessionSecret),
);

const client = new Client({ connectionString });
await client.connect();

try {
  const now = new Date();
  const users = [
    ["session-cert-customer", "session-customer@example.com", "CUSTOMER", "ACTIVE", null],
    ["session-cert-admin", "session-admin@example.com", "ADMIN", "ACTIVE", null],
    ["session-cert-lifecycle-suspended", "session-suspended@example.com", "CUSTOMER", "SUSPENDED", null],
    ["session-cert-flag-suspended", "session-flag-suspended@example.com", "CUSTOMER", "ACTIVE", now],
  ] as const;

  for (const [id, email, role, lifecycleState, suspendedAt] of users) {
    await client.query(
      `INSERT INTO "User"
         ("id", "email", "name", "role", "updatedAt", "lifecycleState", "suspendedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, email, `Certification ${id}`, role, now, lifecycleState, suspendedAt],
    );
  }

  const beforeIssue = new Date();
  const customer = await sessions.issue({
    userId: "session-cert-customer",
    authenticationMethod: "PASSWORD",
    userAgentSummary: "Certification Browser",
    networkHint: "Certification Network",
  });
  const afterIssue = new Date();

  if (customer.status !== "ISSUED") {
    throw new Error(`Customer session issuance failed: ${JSON.stringify(customer)}`);
  }
  if (!customer.token || customer.session.userId !== "session-cert-customer") {
    throw new Error("Customer session did not return its boundary token/session snapshot.");
  }
  if (
    customer.session.authenticationMethod !== "PASSWORD" ||
    customer.session.assuranceLevel !== "RECENTLY_AUTHENTICATED" ||
    customer.session.mfaVerifiedAt !== null ||
    customer.session.recentAuthenticatedAt === null
  ) {
    throw new Error(`Customer session assurance mismatch: ${JSON.stringify(customer.session)}`);
  }

  const lifetime = customer.session.expiresAt.getTime() - customer.session.lastAuthenticatedAt.getTime();
  if (lifetime !== 14 * 24 * 60 * 60 * 1000) {
    throw new Error(`Identity session lifetime drifted: ${lifetime}`);
  }
  if (
    customer.session.lastAuthenticatedAt < beforeIssue ||
    customer.session.lastAuthenticatedAt > afterIssue ||
    customer.session.absoluteExpiresAt.getTime() !== customer.session.expiresAt.getTime()
  ) {
    throw new Error("Identity session timestamps do not match issuance semantics.");
  }

  const stored = await client.query<{
    tokenHash: string;
    userAgentSummary: string | null;
    networkHint: string | null;
  }>(
    `SELECT "tokenHash", "userAgentSummary", "networkHint"
       FROM "Session"
      WHERE "id" = $1`,
    [customer.session.id],
  );
  const storedSession = stored.rows[0];
  if (!storedSession) {
    throw new Error("Issued Identity session was not persisted.");
  }

  const expectedHash = createHmac("sha256", sessionSecret)
    .update(customer.token)
    .digest("hex");
  if (
    storedSession.tokenHash !== expectedHash ||
    storedSession.tokenHash === customer.token ||
    storedSession.userAgentSummary !== "Certification Browser" ||
    storedSession.networkHint !== "Certification Network"
  ) {
    throw new Error("Identity session token boundary or display metadata certification failed.");
  }

  const magic = await sessions.issue({
    userId: "session-cert-customer",
    authenticationMethod: "MAGIC_LINK",
  });
  if (
    magic.status !== "ISSUED" ||
    magic.session.assuranceLevel !== "BASIC" ||
    magic.session.mfaVerifiedAt !== null ||
    magic.session.recentAuthenticatedAt !== null
  ) {
    throw new Error(`Magic-link session assurance mismatch: ${JSON.stringify(magic)}`);
  }

  const adminMfa = await sessions.issue({
    userId: "session-cert-admin",
    authenticationMethod: "PASSWORD_EMAIL_OTP",
  });
  if (
    adminMfa.status !== "ISSUED" ||
    adminMfa.session.mfaVerifiedAt === null ||
    adminMfa.session.recentAuthenticatedAt === null ||
    adminMfa.session.assuranceLevel !== "RECENTLY_AUTHENTICATED"
  ) {
    throw new Error(`Admin MFA session assurance mismatch: ${JSON.stringify(adminMfa)}`);
  }

  for (const userId of [
    "session-cert-lifecycle-suspended",
    "session-cert-flag-suspended",
  ]) {
    const rejected = await sessions.issue({
      userId,
      authenticationMethod: "PASSWORD",
    });
    if (rejected.status !== "REJECTED" || rejected.code !== "ACCOUNT_NOT_ACTIVE") {
      throw new Error(`Inactive customer session was not rejected: ${JSON.stringify(rejected)}`);
    }
  }

  const missing = await sessions.issue({
    userId: "session-cert-missing",
    authenticationMethod: "PASSWORD",
  });
  if (missing.status !== "REJECTED" || missing.code !== "PRINCIPAL_NOT_FOUND") {
    throw new Error(`Missing principal session was not rejected: ${JSON.stringify(missing)}`);
  }

  const rejectedRows = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM "Session"
      WHERE "userId" IN ($1, $2)`,
    ["session-cert-lifecycle-suspended", "session-cert-flag-suspended"],
  );
  if (rejectedRows.rows[0]?.count !== "0") {
    throw new Error("Rejected customer session state leaked into persistence.");
  }

  console.log("Identity session issuance certification GREEN");
} finally {
  await client.end();
}

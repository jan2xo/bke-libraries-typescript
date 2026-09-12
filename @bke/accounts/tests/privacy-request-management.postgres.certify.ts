import { Client } from "pg";
import { createAccountsPrivacyRequestManagementCapability } from "../logic/privacy-request-management";
import { createPostgresAccountsPrivacyRequestManagementRepository } from "../prisma/repositories/postgres-privacy-request-management-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Accounts privacy request certification.");

const client = new Client({ connectionString });
await client.connect();
try {
  const userTable = await client.query<{ user_table: string | null }>(
    `SELECT to_regclass('public."User"')::text AS user_table`,
  );
  const auditTable = await client.query<{ audit_table: string | null }>(
    `SELECT to_regclass('public."AuditLog"')::text AS audit_table`,
  );
  if (userTable.rows[0]?.user_table !== null || auditTable.rows[0]?.audit_table !== null) {
    throw new Error("Accounts privacy persistence must remain independent of User and AuditLog tables.");
  }

  const capability = createAccountsPrivacyRequestManagementCapability(
    createPostgresAccountsPrivacyRequestManagementRepository(connectionString),
  );

  const created = await capability.create({
    userId: "privacy-user-cert",
    customerAccountId: "privacy-account-cert",
    requestType: "EXPORT",
    summary: "Export all customer data",
    ipAddress: "127.0.0.1",
    userAgent: "privacy-cert-agent",
  });
  if (created.status !== "OK" || created.value.status !== "OPEN") {
    throw new Error(`Privacy create failed: ${JSON.stringify(created)}`);
  }

  const requestId = created.value.id;
  const createdEvents = await client.query<{ eventType: string; toStatus: string | null }>(
    `SELECT "eventType", "toStatus" FROM "PrivacyRequestEvent" WHERE "privacyRequestId" = $1 ORDER BY "createdAt"`,
    [requestId],
  );
  if (createdEvents.rowCount !== 1 || createdEvents.rows[0]?.eventType !== "CREATED" || createdEvents.rows[0]?.toStatus !== "OPEN") {
    throw new Error(`Privacy create event failed: ${JSON.stringify(createdEvents.rows)}`);
  }

  const tooShort = await capability.transition({
    actorId: "privacy-admin-cert",
    requestId,
    status: "FULFILLED",
    responseSummary: "too short",
  });
  if (tooShort.status !== "FAILED" || tooShort.code !== "PRIVACY_RESPONSE_REQUIRED") {
    throw new Error(`Privacy minimum response policy failed: ${JSON.stringify(tooShort)}`);
  }

  const reviewing = await capability.transition({
    actorId: "privacy-admin-cert",
    requestId,
    status: "IN_REVIEW",
    responseSummary: "Review started",
  });
  if (reviewing.status !== "OK" || reviewing.value.status !== "IN_REVIEW" || reviewing.value.closedAt !== null) {
    throw new Error(`Privacy IN_REVIEW transition failed: ${JSON.stringify(reviewing)}`);
  }

  const fulfilled = await capability.transition({
    actorId: "privacy-admin-cert",
    requestId,
    status: "FULFILLED",
    responseSummary: "Customer export was prepared and delivered.",
  });
  if (fulfilled.status !== "OK" || fulfilled.value.status !== "FULFILLED" || !fulfilled.value.closedAt) {
    throw new Error(`Privacy FULFILLED transition failed: ${JSON.stringify(fulfilled)}`);
  }

  const closed = await capability.transition({
    actorId: "privacy-admin-cert",
    requestId,
    status: "REJECTED",
    responseSummary: "Should not reopen a closed privacy request.",
  });
  if (closed.status !== "FAILED" || closed.code !== "PRIVACY_REQUEST_CLOSED") {
    throw new Error(`Privacy closed-state protection failed: ${JSON.stringify(closed)}`);
  }

  const events = await client.query<{ eventType: string; fromStatus: string | null; toStatus: string | null }>(
    `SELECT "eventType", "fromStatus", "toStatus" FROM "PrivacyRequestEvent" WHERE "privacyRequestId" = $1 ORDER BY "createdAt", "id"`,
    [requestId],
  );
  if (events.rowCount !== 3) {
    throw new Error(`Expected 3 privacy events, got ${events.rowCount}: ${JSON.stringify(events.rows)}`);
  }

  console.log("Accounts privacy request PostgreSQL certification GREEN");
} finally {
  await client.query(`DELETE FROM "PrivacyRequestEvent"`).catch(() => undefined);
  await client.query(`DELETE FROM "PrivacyRequest"`).catch(() => undefined);
  await client.end();
}

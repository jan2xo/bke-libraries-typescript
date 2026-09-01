import { createHash } from "node:crypto";
import { Client } from "pg";
import { createAccountsInvitationExpirationCapability } from "../logic/invitation-expiration";
import { createPostgresAccountsInvitationExpirationRepository } from "../prisma/repositories/postgres-invitation-expiration-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Accounts invitation expiration certification.");
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const now = new Date("2026-01-10T00:00:00.000Z");
const client = new Client({ connectionString });
await client.connect();
try {
  const userTable = await client.query<{ exists: string | null }>(
    `SELECT to_regclass('public."User"')::text AS "exists"`,
  );
  if (userTable.rows[0]?.exists !== null) {
    throw new Error("Accounts invitation expiration certification must not depend on an Identity User table.");
  }

  const preexistingDue = await client.query<{ id: string; accountId: string }>(
    `SELECT "id", "accountId"
       FROM "Invitation"
      WHERE "status" = 'PENDING'
        AND "expiresAt" <= $1
      ORDER BY "id"`,
    [now],
  );

  await client.query(
    `INSERT INTO "CustomerAccount"
       ("id", "type", "displayName", "ownerId", "billingEmail", "lifecycleState")
     VALUES
       ('expire-active', 'ORGANIZATION', 'Active Org', 'owner-a', 'a@example.com', 'ACTIVE'),
       ('expire-suspended', 'ORGANIZATION', 'Suspended Org', 'owner-b', 'b@example.com', 'SUSPENDED')`,
  );

  await client.query(
    `INSERT INTO "Invitation"
       ("id", "accountId", "email", "role", "tokenHash", "status", "expiresAt")
     VALUES
       ('expire-before', 'expire-active', 'before@example.com', 'MEMBER', $1, 'PENDING', '2026-01-09T23:59:59Z'),
       ('expire-exact', 'expire-active', 'exact@example.com', 'BILLING', $2, 'PENDING', '2026-01-10T00:00:00Z'),
       ('expire-suspended-due', 'expire-suspended', 'suspended@example.com', 'OWNER', $3, 'PENDING', '2026-01-01T00:00:00Z'),
       ('expire-future', 'expire-active', 'future@example.com', 'MEMBER', $4, 'PENDING', '2026-01-10T00:00:01Z'),
       ('expire-accepted', 'expire-active', 'accepted@example.com', 'MEMBER', $5, 'ACCEPTED', '2026-01-01T00:00:00Z'),
       ('expire-revoked', 'expire-active', 'revoked@example.com', 'MEMBER', $6, 'REVOKED', '2026-01-01T00:00:00Z')`,
    ["before", "exact", "suspended", "future", "accepted", "revoked"].map(hash),
  );

  const capability = createAccountsInvitationExpirationCapability(
    createPostgresAccountsInvitationExpirationRepository(connectionString),
    { now: () => now },
  );
  const result = await capability.expire();
  const expectedExpired = [
    ...preexistingDue.rows,
    { id: "expire-before", accountId: "expire-active" },
    { id: "expire-exact", accountId: "expire-active" },
    { id: "expire-suspended-due", accountId: "expire-suspended" },
  ].sort((left, right) => left.id.localeCompare(right.id));
  if (result.status !== "EXPIRED" || result.count !== expectedExpired.length) {
    throw new Error(
      `Expected global sweep of ${expectedExpired.length} due invitations, received ${JSON.stringify(result)}`,
    );
  }
  const expired = [...result.invitations].sort((left, right) => left.id.localeCompare(right.id));
  if (JSON.stringify(expired) !== JSON.stringify(expectedExpired)) {
    throw new Error(
      `Expiration did not sweep the exact global due set. expected=${JSON.stringify(expectedExpired)} actual=${JSON.stringify(expired)}`,
    );
  }
  const expectedAuditIntents = expectedExpired.map((invitation) => ({
    action: "ORGANIZATION_INVITATION_EXPIRED" as const,
    accountId: invitation.accountId,
    targetType: "Invitation" as const,
    targetId: invitation.id,
  }));
  const auditIntents = [...result.auditIntents].sort((left, right) =>
    left.targetId.localeCompare(right.targetId),
  );
  if (JSON.stringify(auditIntents) !== JSON.stringify(expectedAuditIntents)) {
    throw new Error("Expiration did not return one exact audit intent per globally expired invitation.");
  }

  const states = await client.query<{
    id: string;
    status: string;
    email: string;
    role: string;
    tokenHash: string;
    expiresAt: Date;
  }>(
    `SELECT "id", "status", "email", "role", "tokenHash", "expiresAt"
       FROM "Invitation"
      WHERE "id" LIKE 'expire-%'
      ORDER BY "id"`,
  );
  const byId = new Map(states.rows.map((row) => [row.id, row]));
  for (const id of ["expire-before", "expire-exact", "expire-suspended-due"]) {
    if (byId.get(id)?.status !== "EXPIRED") throw new Error(`${id} was not expired.`);
  }
  if (byId.get("expire-future")?.status !== "PENDING") {
    throw new Error("Future invitation was expired before its deadline.");
  }
  if (byId.get("expire-accepted")?.status !== "ACCEPTED" || byId.get("expire-revoked")?.status !== "REVOKED") {
    throw new Error("Expiration mutated a non-PENDING invitation.");
  }
  const exact = byId.get("expire-exact");
  if (
    !exact ||
    exact.email !== "exact@example.com" ||
    exact.role !== "BILLING" ||
    exact.tokenHash !== hash("exact") ||
    exact.expiresAt.toISOString() !== now.toISOString()
  ) {
    throw new Error("Expiration changed fields other than status.");
  }

  const second = await capability.expire({ now });
  if (second.status !== "EXPIRED" || second.count !== 0) {
    throw new Error(`Expected idempotent zero-count rerun, received ${JSON.stringify(second)}`);
  }

  await client.query(
    `INSERT INTO "Invitation"
       ("id", "accountId", "email", "role", "tokenHash", "status", "expiresAt")
     VALUES
       ('expire-batch-ok', 'expire-active', 'batch-ok@example.com', 'MEMBER', $1, 'PENDING', '2026-01-01T00:00:00Z'),
       ('expire-fail', 'expire-active', 'fail@example.com', 'MEMBER', $2, 'PENDING', '2026-01-01T00:00:00Z')`,
    [hash("batch-ok"), hash("fail")],
  );
  await client.query(`
    CREATE OR REPLACE FUNCTION "bke_fail_invitation_expiration"() RETURNS trigger AS $$
    BEGIN
      IF OLD."id" = 'expire-fail' AND NEW."status" = 'EXPIRED' THEN
        RAISE EXCEPTION 'forced invitation expiration failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER "bke_fail_invitation_expiration_trigger"
      BEFORE UPDATE ON "Invitation"
      FOR EACH ROW EXECUTE FUNCTION "bke_fail_invitation_expiration"();
  `);

  const failed = await capability.expire({ now });
  if (failed.status !== "FAILED" || failed.code !== "PERSISTENCE_UNAVAILABLE") {
    throw new Error(`Expected atomic persistence failure, received ${JSON.stringify(failed)}`);
  }
  const failedStates = await client.query<{ id: string; status: string }>(
    `SELECT "id", "status" FROM "Invitation"
      WHERE "id" IN ('expire-batch-ok', 'expire-fail') ORDER BY "id"`,
  );
  if (failedStates.rows.some((row) => row.status !== "PENDING")) {
    throw new Error("Failed expiration did not roll back the entire due batch atomically.");
  }

  console.log("Accounts invitation expiration PostgreSQL certification GREEN");
} finally {
  await client.end();
}

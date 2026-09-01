import { createHash } from "node:crypto";
import { Client } from "pg";
import { createAccountsAccountAccessCapability } from "../logic/account-access";
import { createAccountsInvitationIssuanceCapability } from "../logic/invitation-issuance";
import { createPostgresAccountsAccountAccessRepository } from "../prisma/repositories/postgres-account-access-repository";
import { createPostgresAccountsInvitationIssuanceRepository } from "../prisma/repositories/postgres-invitation-issuance-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Accounts invitation certification.");

const client = new Client({ connectionString });
await client.connect();
try {
  const userTable = await client.query<{ exists: string | null }>(
    `SELECT to_regclass('public."User"')::text AS "exists"`,
  );
  if (userTable.rows[0]?.exists !== null) {
    throw new Error("Accounts invitation certification must not depend on an Identity User table.");
  }

  await client.query(
    `INSERT INTO "CustomerAccount"
       ("id", "type", "displayName", "ownerId", "billingEmail", "lifecycleState")
     VALUES
       ('invite-org', 'ORGANIZATION', 'Invite Org', 'invite-owner', 'billing@example.com', 'ACTIVE'),
       ('invite-suspended', 'ORGANIZATION', 'Suspended Org', 'invite-owner', 'suspended@example.com', 'SUSPENDED')`,
  );
  await client.query(
    `INSERT INTO "Membership" ("accountId", "userId", "role")
     VALUES ('invite-org', 'invite-member', 'MEMBER')`,
  );

  const access = createAccountsAccountAccessCapability(
    createPostgresAccountsAccountAccessRepository(connectionString),
  );
  const repository = createPostgresAccountsInvitationIssuanceRepository(connectionString);
  const ids = ["inv-1", "inv-2", "inv-fail"];
  const tokens = ["raw-token-1", "raw-token-2", "raw-token-2"];
  const capability = createAccountsInvitationIssuanceCapability(
    access,
    repository,
    {
      issue: () => {
        const value = ids.shift();
        if (!value) throw new Error("No invitation id remaining.");
        return value;
      },
    },
    {
      issue: () => {
        const rawToken = tokens.shift();
        if (!rawToken) throw new Error("No token remaining.");
        return {
          rawToken,
          tokenHash: createHash("sha256").update(rawToken).digest("hex"),
        };
      },
    },
    { now: () => new Date("2026-01-01T00:00:00.000Z") },
  );

  const first = await capability.issue({
    actorPrincipalId: "invite-owner",
    accountId: "invite-org",
    email: " INVITED@EXAMPLE.COM ",
    role: "OWNER",
  });
  if (first.status !== "ISSUED" || first.token !== "raw-token-1") {
    throw new Error(`Expected first invitation ISSUED, received ${JSON.stringify(first)}`);
  }
  if (first.invitation.expiresAt.toISOString() !== "2026-01-08T00:00:00.000Z") {
    throw new Error("Invitation default expiry is not exactly seven days from the injected clock.");
  }

  const storedFirst = await client.query<{
    email: string;
    role: string;
    tokenHash: string;
    status: string;
  }>(
    `SELECT "email", "role", "tokenHash", "status"
       FROM "Invitation" WHERE "id" = 'inv-1'`,
  );
  const row = storedFirst.rows[0];
  if (!row) throw new Error("First invitation was not persisted.");
  if (row.email !== "invited@example.com" || row.role !== "OWNER" || row.status !== "PENDING") {
    throw new Error(`Unexpected persisted invitation: ${JSON.stringify(row)}`);
  }
  const expectedHash = createHash("sha256").update("raw-token-1").digest("hex");
  if (row.tokenHash !== expectedHash || row.tokenHash === "raw-token-1") {
    throw new Error("Invitation token was not persisted as SHA-256-only material.");
  }

  const second = await capability.issue({
    actorPrincipalId: "invite-owner",
    accountId: "invite-org",
    email: "invited@example.com",
    role: "MEMBER",
  });
  if (second.status !== "ISSUED") {
    throw new Error(`Expected duplicate-email invitation ISSUED, received ${JSON.stringify(second)}`);
  }
  const duplicateCount = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS "count" FROM "Invitation"
      WHERE "accountId" = 'invite-org' AND "email" = 'invited@example.com' AND "status" = 'PENDING'`,
  );
  if (duplicateCount.rows[0]?.count !== "2") {
    throw new Error("V1 duplicate pending invitation behavior was not preserved.");
  }

  const unauthorized = await capability.issue({
    actorPrincipalId: "invite-member",
    accountId: "invite-org",
    email: "blocked@example.com",
    role: "MEMBER",
  });
  if (unauthorized.status !== "REJECTED" || unauthorized.code !== "ACCOUNT_ROLE_FORBIDDEN") {
    throw new Error(`Expected unauthorized rejection, received ${JSON.stringify(unauthorized)}`);
  }

  const suspended = await capability.issue({
    actorPrincipalId: "invite-owner",
    accountId: "invite-suspended",
    email: "blocked2@example.com",
    role: "MEMBER",
  });
  if (suspended.status !== "REJECTED" || suspended.code !== "SUSPENDED_ACCOUNT") {
    throw new Error(`Expected suspended rejection, received ${JSON.stringify(suspended)}`);
  }

  const failed = await capability.issue({
    actorPrincipalId: "invite-owner",
    accountId: "invite-org",
    email: "failure@example.com",
    role: "BILLING",
  });
  if (failed.status !== "FAILED" || failed.code !== "PERSISTENCE_UNAVAILABLE") {
    throw new Error(`Expected unique-token persistence failure, received ${JSON.stringify(failed)}`);
  }
  const failedRows = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS "count" FROM "Invitation" WHERE "id" = 'inv-fail'`,
  );
  if (failedRows.rows[0]?.count !== "0") {
    throw new Error("Failed invitation INSERT left partial persistence behind.");
  }

  console.log("Accounts invitation issuance PostgreSQL certification GREEN");
} finally {
  await client.end();
}

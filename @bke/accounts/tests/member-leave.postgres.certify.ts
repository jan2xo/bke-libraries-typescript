import { Client } from "pg";
import type { AccountsAccountAccessCapability } from "../contracts/account-access.contract";
import { createAccountsAccountAccessCapability } from "../logic/account-access";
import { createAccountsMemberLeaveCapability } from "../logic/member-leave";
import { createPostgresAccountsAccountAccessRepository } from "../prisma/repositories/postgres-account-access-repository";
import { createPostgresAccountsMemberLeaveRepository } from "../prisma/repositories/postgres-member-leave-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Accounts member leave certification.");
}

const client = new Client({ connectionString });
await client.connect();
try {
  const userTable = await client.query<{ exists: string | null }>(
    `SELECT to_regclass('public."User"')::text AS "exists"`,
  );
  if (userTable.rows[0]?.exists !== null) {
    throw new Error("Accounts member leave certification must not depend on an Identity User table.");
  }

  await client.query(
    `INSERT INTO "CustomerAccount"
       ("id", "type", "displayName", "ownerId", "billingEmail", "lifecycleState")
     VALUES
       ('leave-active', 'ORGANIZATION', 'Leave Active', 'leave-owner', 'active@example.com', 'ACTIVE'),
       ('leave-suspended', 'ORGANIZATION', 'Leave Suspended', 'leave-owner', 'suspended@example.com', 'SUSPENDED'),
       ('leave-closed', 'ORGANIZATION', 'Leave Closed', 'leave-owner', 'closed@example.com', 'CLOSED'),
       ('leave-owner-account', 'ORGANIZATION', 'Leave Owner', 'leave-owner-self', 'owner@example.com', 'ACTIVE'),
       ('leave-stale-owner', 'ORGANIZATION', 'Leave Stale Owner', 'different-owner', 'stale@example.com', 'ACTIVE'),
       ('leave-failure', 'ORGANIZATION', 'Leave Failure', 'leave-owner', 'failure@example.com', 'ACTIVE'),
       ('leave-individual', 'INDIVIDUAL', 'Leave Individual', 'individual-owner', 'individual@example.com', 'ACTIVE')`,
  );
  await client.query(
    `INSERT INTO "Membership" ("accountId", "userId", "role")
     VALUES
       ('leave-active', 'leave-member', 'MEMBER'),
       ('leave-suspended', 'leave-suspended-member', 'BILLING'),
       ('leave-closed', 'leave-closed-member', 'LICENSE_MANAGER'),
       ('leave-owner-account', 'leave-owner-self', 'MEMBER'),
       ('leave-stale-owner', 'leave-stale-member', 'OWNER'),
       ('leave-failure', 'leave-failure-member', 'MEMBER'),
       ('leave-individual', 'leave-individual-member', 'MEMBER')`,
  );

  const repository = createPostgresAccountsMemberLeaveRepository(connectionString);
  const capability = createAccountsMemberLeaveCapability(
    createAccountsAccountAccessCapability(
      createPostgresAccountsAccountAccessRepository(connectionString),
    ),
    repository,
  );

  const before = await client.query<{ createdAt: Date }>(
    `SELECT "createdAt" FROM "Membership"
      WHERE "accountId" = 'leave-active' AND "userId" = 'leave-member'`,
  );
  const originalCreatedAt = before.rows[0]?.createdAt;
  if (!originalCreatedAt) throw new Error("Active leave fixture missing.");

  const left = await capability.leave({ principalId: "leave-member", accountId: "leave-active" });
  if (left.status !== "LEFT") {
    throw new Error(`Expected LEFT, received ${JSON.stringify(left)}`);
  }
  if (
    left.membership.accountId !== "leave-active" ||
    left.membership.userId !== "leave-member" ||
    left.membership.role !== "MEMBER" ||
    left.membership.createdAt.toISOString() !== originalCreatedAt.toISOString()
  ) {
    throw new Error(`Leave result did not preserve removed membership snapshot: ${JSON.stringify(left)}`);
  }
  const activeRemaining = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS "count" FROM "Membership"
      WHERE "accountId" = 'leave-active' AND "userId" = 'leave-member'`,
  );
  if (Number(activeRemaining.rows[0]?.count ?? "0") !== 0) {
    throw new Error("Successful member leave did not delete the Membership row.");
  }

  for (const [principalId, accountId] of [
    ["leave-suspended-member", "leave-suspended"],
    ["leave-closed-member", "leave-closed"],
  ] as const) {
    const result = await capability.leave({ principalId, accountId });
    if (result.status !== "LEFT") {
      throw new Error(
        `V1 permits non-owner leave regardless of lifecycle. account=${accountId} result=${JSON.stringify(result)}`,
      );
    }
  }

  const owner = await capability.leave({
    principalId: "leave-owner-self",
    accountId: "leave-owner-account",
  });
  if (owner.status !== "REJECTED" || owner.code !== "OWNER_CANNOT_LEAVE") {
    throw new Error(`Expected OWNER_CANNOT_LEAVE, received ${JSON.stringify(owner)}`);
  }
  const ownerMembership = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS "count" FROM "Membership"
      WHERE "accountId" = 'leave-owner-account' AND "userId" = 'leave-owner-self'`,
  );
  if (Number(ownerMembership.rows[0]?.count ?? "0") !== 1) {
    throw new Error("Owner leave rejection did not preserve the Membership row.");
  }

  const individual = await capability.leave({
    principalId: "leave-individual-member",
    accountId: "leave-individual",
  });
  if (individual.status !== "REJECTED" || individual.code !== "ACCOUNT_NOT_ORGANIZATION") {
    throw new Error(`Expected ACCOUNT_NOT_ORGANIZATION, received ${JSON.stringify(individual)}`);
  }

  const staleMemberAccess: AccountsAccountAccessCapability = {
    authorize: async () => ({
      status: "AUTHORIZED",
      account: {
        id: "leave-stale-owner",
        type: "ORGANIZATION",
        displayName: "Leave Stale Owner",
        ownerId: "different-owner",
        billingEmail: "stale@example.com",
        taxId: null,
        lifecycleState: "ACTIVE",
      },
      effectiveRole: "MEMBER",
    }),
  };
  const staleCapability = createAccountsMemberLeaveCapability(staleMemberAccess, repository);
  const staleOwner = await staleCapability.leave({
    principalId: "leave-stale-member",
    accountId: "leave-stale-owner",
  });
  if (staleOwner.status !== "REJECTED" || staleOwner.code !== "OWNER_CANNOT_LEAVE") {
    throw new Error(
      `Repository ownership recheck failed for stale authorization: ${JSON.stringify(staleOwner)}`,
    );
  }
  const staleOwnerMembership = await client.query<{ role: string }>(
    `SELECT "role" FROM "Membership"
      WHERE "accountId" = 'leave-stale-owner' AND "userId" = 'leave-stale-member'`,
  );
  if (staleOwnerMembership.rows[0]?.role !== "OWNER") {
    throw new Error("Stale-authorization owner recheck did not preserve OWNER Membership.");
  }

  const missing = await staleCapability.leave({
    principalId: "missing-member",
    accountId: "leave-stale-owner",
  });
  if (missing.status !== "REJECTED" || missing.code !== "MEMBER_NOT_FOUND") {
    throw new Error(`Expected MEMBER_NOT_FOUND, received ${JSON.stringify(missing)}`);
  }

  await client.query(`
    CREATE FUNCTION fail_member_leave() RETURNS trigger AS $$
    BEGIN
      IF OLD."accountId" = 'leave-failure' AND OLD."userId" = 'leave-failure-member' THEN
        RAISE EXCEPTION 'forced member leave failure';
      END IF;
      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER member_leave_failure
      BEFORE DELETE ON "Membership"
      FOR EACH ROW EXECUTE FUNCTION fail_member_leave();
  `);

  const failed = await capability.leave({
    principalId: "leave-failure-member",
    accountId: "leave-failure",
  });
  if (failed.status !== "FAILED" || failed.code !== "PERSISTENCE_UNAVAILABLE") {
    throw new Error(`Expected persistence failure, received ${JSON.stringify(failed)}`);
  }
  const failedState = await client.query<{ role: string }>(
    `SELECT "role" FROM "Membership"
      WHERE "accountId" = 'leave-failure' AND "userId" = 'leave-failure-member'`,
  );
  if (failedState.rows[0]?.role !== "MEMBER") {
    throw new Error("Failed member leave did not preserve the Membership row.");
  }

  console.log("Accounts member leave PostgreSQL certification GREEN");
} finally {
  await client.end();
}

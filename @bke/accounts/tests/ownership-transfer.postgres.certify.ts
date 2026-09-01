import { Client } from "pg";
import type { AccountsAccountAccessCapability } from "../contracts/account-access.contract";
import { createAccountsAccountAccessCapability } from "../logic/account-access";
import { createAccountsOwnershipTransferCapability } from "../logic/ownership-transfer";
import { createPostgresAccountsAccountAccessRepository } from "../prisma/repositories/postgres-account-access-repository";
import { createPostgresAccountsOwnershipTransferRepository } from "../prisma/repositories/postgres-ownership-transfer-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Accounts ownership transfer certification.");
}

const client = new Client({ connectionString });
await client.connect();
try {
  const userTable = await client.query<{ exists: string | null }>(
    `SELECT to_regclass('public."User"')::text AS "exists"`,
  );
  if (userTable.rows[0]?.exists !== null) {
    throw new Error("Accounts ownership transfer certification must not depend on an Identity User table.");
  }

  await client.query(
    `INSERT INTO "CustomerAccount"
       ("id", "type", "displayName", "ownerId", "billingEmail", "lifecycleState")
     VALUES
       ('transfer-org', 'ORGANIZATION', 'Transfer Org', 'transfer-old', 'transfer@example.com', 'ACTIVE'),
       ('transfer-no-old-membership', 'ORGANIZATION', 'Transfer Missing Old Membership', 'ghost-old', 'ghost@example.com', 'ACTIVE'),
       ('transfer-failure', 'ORGANIZATION', 'Transfer Failure', 'failure-old', 'failure@example.com', 'ACTIVE'),
       ('transfer-stale-suspended', 'ORGANIZATION', 'Transfer Stale Suspended', 'stale-old', 'stale@example.com', 'SUSPENDED')`,
  );
  await client.query(
    `INSERT INTO "Membership" ("accountId", "userId", "role")
     VALUES
       ('transfer-org', 'transfer-old', 'OWNER'),
       ('transfer-org', 'transfer-new', 'MEMBER'),
       ('transfer-no-old-membership', 'transfer-actor', 'OWNER'),
       ('transfer-no-old-membership', 'transfer-new-2', 'BILLING'),
       ('transfer-failure', 'failure-old', 'OWNER'),
       ('transfer-failure', 'failure-new', 'BILLING'),
       ('transfer-stale-suspended', 'stale-old', 'OWNER'),
       ('transfer-stale-suspended', 'stale-new', 'MEMBER')`,
  );

  const repository = createPostgresAccountsOwnershipTransferRepository(connectionString);
  const capability = createAccountsOwnershipTransferCapability(
    createAccountsAccountAccessCapability(
      createPostgresAccountsAccountAccessRepository(connectionString),
    ),
    repository,
  );

  const transferred = await capability.transfer({
    actorPrincipalId: "transfer-old",
    accountId: "transfer-org",
    newOwnerPrincipalId: "transfer-new",
  });
  if (transferred.status !== "TRANSFERRED") {
    throw new Error(`Expected TRANSFERRED, received ${JSON.stringify(transferred)}`);
  }
  if (
    transferred.account.ownerId !== "transfer-new" ||
    transferred.newOwnerMembership.role !== "OWNER" ||
    transferred.previousOwnerPrincipalId !== "transfer-old" ||
    transferred.previousNewOwnerRole !== "MEMBER" ||
    transferred.previousOwnerMembershipDemoted !== true
  ) {
    throw new Error(`Ownership transfer returned wrong state: ${JSON.stringify(transferred)}`);
  }
  if (
    transferred.auditIntents[0]?.action !== "ORGANIZATION_OWNER_DEMOTED" ||
    transferred.auditIntents[1]?.action !== "ORGANIZATION_OWNER_TRANSFERRED"
  ) {
    throw new Error("Ownership transfer did not return both host-owned V1 audit intents.");
  }

  const transferredState = await client.query<{
    ownerId: string;
    oldRole: string;
    newRole: string;
  }>(
    `SELECT a."ownerId",
            old_member."role" AS "oldRole",
            new_member."role" AS "newRole"
       FROM "CustomerAccount" a
       JOIN "Membership" old_member
         ON old_member."accountId" = a."id" AND old_member."userId" = 'transfer-old'
       JOIN "Membership" new_member
         ON new_member."accountId" = a."id" AND new_member."userId" = 'transfer-new'
      WHERE a."id" = 'transfer-org'`,
  );
  const state = transferredState.rows[0];
  if (!state || state.ownerId !== "transfer-new" || state.oldRole !== "BILLING" || state.newRole !== "OWNER") {
    throw new Error(`Ownership transfer persistence mismatch: ${JSON.stringify(state)}`);
  }

  const sameOwner = await capability.transfer({
    actorPrincipalId: "transfer-new",
    accountId: "transfer-org",
    newOwnerPrincipalId: "transfer-new",
  });
  if (sameOwner.status !== "REJECTED" || sameOwner.code !== "MEMBER_NOT_FOUND") {
    throw new Error(`Expected V1 same-owner MEMBER_NOT_FOUND, received ${JSON.stringify(sameOwner)}`);
  }

  const missingMember = await capability.transfer({
    actorPrincipalId: "transfer-new",
    accountId: "transfer-org",
    newOwnerPrincipalId: "missing-target",
  });
  if (missingMember.status !== "REJECTED" || missingMember.code !== "MEMBER_NOT_FOUND") {
    throw new Error(`Expected MEMBER_NOT_FOUND, received ${JSON.stringify(missingMember)}`);
  }

  const noOldMembership = await capability.transfer({
    actorPrincipalId: "transfer-actor",
    accountId: "transfer-no-old-membership",
    newOwnerPrincipalId: "transfer-new-2",
  });
  if (noOldMembership.status !== "TRANSFERRED") {
    throw new Error(`Expected transfer without old owner Membership, received ${JSON.stringify(noOldMembership)}`);
  }
  if (noOldMembership.previousOwnerMembershipDemoted !== false) {
    throw new Error("Transfer should report no physical old-owner Membership demotion when V1 updateMany would match zero rows.");
  }
  if (noOldMembership.auditIntents[0]?.action !== "ORGANIZATION_OWNER_DEMOTED") {
    throw new Error("V1 still emits the owner-demoted audit intent even when no OWNER Membership row matched.");
  }

  const staleAccess: AccountsAccountAccessCapability = {
    authorize: async () => ({
      status: "AUTHORIZED",
      account: {
        id: "transfer-stale-suspended",
        type: "ORGANIZATION",
        displayName: "Transfer Stale Suspended",
        ownerId: "stale-old",
        billingEmail: "stale@example.com",
        taxId: null,
        lifecycleState: "ACTIVE",
      },
      effectiveRole: "OWNER",
    }),
  };
  const staleCapability = createAccountsOwnershipTransferCapability(staleAccess, repository);
  const staleSuspended = await staleCapability.transfer({
    actorPrincipalId: "stale-old",
    accountId: "transfer-stale-suspended",
    newOwnerPrincipalId: "stale-new",
  });
  if (staleSuspended.status !== "REJECTED" || staleSuspended.code !== "SUSPENDED_ACCOUNT") {
    throw new Error(
      `Transactional mutable-organization recheck failed: ${JSON.stringify(staleSuspended)}`,
    );
  }

  await client.query(`
    CREATE FUNCTION fail_ownership_transfer_demotion() RETURNS trigger AS $$
    BEGIN
      IF NEW."accountId" = 'transfer-failure'
         AND NEW."userId" = 'failure-old'
         AND OLD."role" = 'OWNER'
         AND NEW."role" = 'BILLING' THEN
        RAISE EXCEPTION 'forced ownership transfer demotion failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER ownership_transfer_demotion_failure
      BEFORE UPDATE ON "Membership"
      FOR EACH ROW EXECUTE FUNCTION fail_ownership_transfer_demotion();
  `);

  const failed = await capability.transfer({
    actorPrincipalId: "failure-old",
    accountId: "transfer-failure",
    newOwnerPrincipalId: "failure-new",
  });
  if (failed.status !== "FAILED" || failed.code !== "PERSISTENCE_UNAVAILABLE") {
    throw new Error(`Expected persistence failure, received ${JSON.stringify(failed)}`);
  }

  const failedState = await client.query<{
    ownerId: string;
    oldRole: string;
    newRole: string;
  }>(
    `SELECT a."ownerId",
            old_member."role" AS "oldRole",
            new_member."role" AS "newRole"
       FROM "CustomerAccount" a
       JOIN "Membership" old_member
         ON old_member."accountId" = a."id" AND old_member."userId" = 'failure-old'
       JOIN "Membership" new_member
         ON new_member."accountId" = a."id" AND new_member."userId" = 'failure-new'
      WHERE a."id" = 'transfer-failure'`,
  );
  const rollback = failedState.rows[0];
  if (!rollback || rollback.ownerId !== "failure-old" || rollback.oldRole !== "OWNER" || rollback.newRole !== "BILLING") {
    throw new Error(
      `Forced old-owner demotion failure did not roll back target promotion + ownerId movement: ${JSON.stringify(rollback)}`,
    );
  }

  console.log("Accounts ownership transfer PostgreSQL certification GREEN");
} finally {
  await client.end();
}

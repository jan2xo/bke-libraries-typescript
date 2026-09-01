import { Client } from "pg";
import { createAccountsAccountAccessCapability } from "../logic/account-access";
import { createAccountsMembershipRemovalCapability } from "../logic/membership-removal";
import { createPostgresAccountsAccountAccessRepository } from "../prisma/repositories/postgres-account-access-repository";
import { createPostgresAccountsMembershipRemovalRepository } from "../prisma/repositories/postgres-membership-removal-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Accounts membership removal certification.");
}

const client = new Client({ connectionString });
await client.connect();
try {
  const userTable = await client.query<{ exists: string | null }>(
    `SELECT to_regclass('public."User"')::text AS "exists"`,
  );
  if (userTable.rows[0]?.exists !== null) {
    throw new Error("Accounts membership removal certification must not depend on an Identity User table.");
  }

  await client.query(
    `INSERT INTO "CustomerAccount"
       ("id", "type", "displayName", "ownerId", "billingEmail", "lifecycleState")
     VALUES
       ('remove-org', 'ORGANIZATION', 'Remove Org', 'remove-actor', 'remove@example.com', 'ACTIVE'),
       ('remove-concurrent', 'ORGANIZATION', 'Concurrent Remove Org', 'remove-race-actor', 'remove-race@example.com', 'ACTIVE'),
       ('remove-suspended', 'ORGANIZATION', 'Suspended Remove Org', 'remove-actor', 'remove-suspended@example.com', 'SUSPENDED')`,
  );
  await client.query(
    `INSERT INTO "Membership" ("accountId", "userId", "role")
     VALUES
       ('remove-org', 'remove-actor', 'OWNER'),
       ('remove-org', 'remove-target', 'MEMBER'),
       ('remove-org', 'remove-owner-2', 'OWNER'),
       ('remove-org', 'remove-failure', 'BILLING'),
       ('remove-concurrent', 'remove-race-actor', 'OWNER'),
       ('remove-concurrent', 'remove-race-owner-2', 'OWNER')`,
  );

  const capability = createAccountsMembershipRemovalCapability(
    createAccountsAccountAccessCapability(
      createPostgresAccountsAccountAccessRepository(connectionString),
    ),
    createPostgresAccountsMembershipRemovalRepository(connectionString),
  );

  const before = await client.query<{ createdAt: Date }>(
    `SELECT "createdAt" FROM "Membership"
      WHERE "accountId" = 'remove-org' AND "userId" = 'remove-target'`,
  );
  const originalCreatedAt = before.rows[0]?.createdAt;
  if (!originalCreatedAt) throw new Error("Removal target fixture missing.");

  const removed = await capability.remove({
    actorPrincipalId: "remove-actor",
    accountId: "remove-org",
    targetPrincipalId: "remove-target",
  });
  if (removed.status !== "REMOVED") {
    throw new Error(`Expected membership removal, received ${JSON.stringify(removed)}`);
  }
  if (
    removed.membership.role !== "MEMBER" ||
    removed.membership.createdAt.toISOString() !== originalCreatedAt.toISOString() ||
    removed.auditIntent.targetId !== "remove-target"
  ) {
    throw new Error(`Membership removal returned incorrect snapshot: ${JSON.stringify(removed)}`);
  }
  const removedCount = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS "count" FROM "Membership"
      WHERE "accountId" = 'remove-org' AND "userId" = 'remove-target'`,
  );
  if (Number(removedCount.rows[0]?.count ?? "0") !== 0) {
    throw new Error("Removed Membership still exists.");
  }

  const removedOwner = await capability.remove({
    actorPrincipalId: "remove-actor",
    accountId: "remove-org",
    targetPrincipalId: "remove-owner-2",
  });
  if (removedOwner.status !== "REMOVED" || removedOwner.membership.role !== "OWNER") {
    throw new Error(`Expected OWNER removal while another OWNER exists, received ${JSON.stringify(removedOwner)}`);
  }

  const lastOwnerRejected = await capability.remove({
    actorPrincipalId: "remove-actor",
    accountId: "remove-org",
    targetPrincipalId: "remove-actor",
  });
  if (
    lastOwnerRejected.status !== "REJECTED" ||
    lastOwnerRejected.code !== "LAST_OWNER_REQUIRED"
  ) {
    throw new Error(`Expected LAST_OWNER_REQUIRED, received ${JSON.stringify(lastOwnerRejected)}`);
  }
  const lastOwnerExists = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS "count" FROM "Membership"
      WHERE "accountId" = 'remove-org' AND "userId" = 'remove-actor' AND "role" = 'OWNER'`,
  );
  if (Number(lastOwnerExists.rows[0]?.count ?? "0") !== 1) {
    throw new Error("Last-owner rejection removed the final OWNER Membership.");
  }

  const missing = await capability.remove({
    actorPrincipalId: "remove-actor",
    accountId: "remove-org",
    targetPrincipalId: "missing-member",
  });
  if (missing.status !== "REJECTED" || missing.code !== "MEMBER_NOT_FOUND") {
    throw new Error(`Expected MEMBER_NOT_FOUND, received ${JSON.stringify(missing)}`);
  }

  const suspended = await capability.remove({
    actorPrincipalId: "remove-actor",
    accountId: "remove-suspended",
    targetPrincipalId: "anything",
  });
  if (suspended.status !== "REJECTED" || suspended.code !== "SUSPENDED_ACCOUNT") {
    throw new Error(`Expected SUSPENDED_ACCOUNT, received ${JSON.stringify(suspended)}`);
  }

  const race = await Promise.all([
    capability.remove({
      actorPrincipalId: "remove-race-actor",
      accountId: "remove-concurrent",
      targetPrincipalId: "remove-race-actor",
    }),
    capability.remove({
      actorPrincipalId: "remove-race-actor",
      accountId: "remove-concurrent",
      targetPrincipalId: "remove-race-owner-2",
    }),
  ]);
  const raceRemoved = race.filter((result) => result.status === "REMOVED").length;
  const raceRejected = race.filter(
    (result) => result.status === "REJECTED" && result.code === "LAST_OWNER_REQUIRED",
  ).length;
  if (raceRemoved !== 1 || raceRejected !== 1) {
    throw new Error(`Concurrent OWNER removals violated last-owner safety: ${JSON.stringify(race)}`);
  }
  const remainingOwners = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS "count" FROM "Membership"
      WHERE "accountId" = 'remove-concurrent' AND "role" = 'OWNER'`,
  );
  if (Number(remainingOwners.rows[0]?.count ?? "0") !== 1) {
    throw new Error("Concurrent OWNER removals did not leave exactly one OWNER Membership.");
  }

  await client.query(`
    CREATE FUNCTION fail_membership_removal() RETURNS trigger AS $$
    BEGIN
      IF OLD."accountId" = 'remove-org' AND OLD."userId" = 'remove-failure' THEN
        RAISE EXCEPTION 'forced membership removal failure';
      END IF;
      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER membership_removal_failure
      BEFORE DELETE ON "Membership"
      FOR EACH ROW EXECUTE FUNCTION fail_membership_removal();
  `);

  const failed = await capability.remove({
    actorPrincipalId: "remove-actor",
    accountId: "remove-org",
    targetPrincipalId: "remove-failure",
  });
  if (failed.status !== "FAILED" || failed.code !== "PERSISTENCE_UNAVAILABLE") {
    throw new Error(`Expected persistence failure, received ${JSON.stringify(failed)}`);
  }
  const failureState = await client.query<{ role: string }>(
    `SELECT "role" FROM "Membership"
      WHERE "accountId" = 'remove-org' AND "userId" = 'remove-failure'`,
  );
  if (failureState.rows[0]?.role !== "BILLING") {
    throw new Error("Failed Membership removal did not preserve the target row.");
  }

  console.log("Accounts membership removal PostgreSQL certification GREEN");
} finally {
  await client.end();
}

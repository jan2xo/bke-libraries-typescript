import { Client } from "pg";
import { createAccountsAccountAccessCapability } from "../logic/account-access";
import { createAccountsMembershipRoleChangeCapability } from "../logic/membership-role-change";
import { createPostgresAccountsAccountAccessRepository } from "../prisma/repositories/postgres-account-access-repository";
import { createPostgresAccountsMembershipRoleChangeRepository } from "../prisma/repositories/postgres-membership-role-change-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Accounts membership role change certification.");
}

const client = new Client({ connectionString });
await client.connect();
try {
  const userTable = await client.query<{ exists: string | null }>(
    `SELECT to_regclass('public."User"')::text AS "exists"`,
  );
  if (userTable.rows[0]?.exists !== null) {
    throw new Error("Accounts membership role change certification must not depend on an Identity User table.");
  }

  await client.query(
    `INSERT INTO "CustomerAccount"
       ("id", "type", "displayName", "ownerId", "billingEmail", "lifecycleState")
     VALUES
       ('role-org', 'ORGANIZATION', 'Role Org', 'role-actor', 'role@example.com', 'ACTIVE'),
       ('role-concurrent', 'ORGANIZATION', 'Concurrent Org', 'race-actor', 'race@example.com', 'ACTIVE'),
       ('role-suspended', 'ORGANIZATION', 'Suspended Role Org', 'role-actor', 'suspended-role@example.com', 'SUSPENDED')`,
  );
  await client.query(
    `INSERT INTO "Membership" ("accountId", "userId", "role")
     VALUES
       ('role-org', 'role-actor', 'OWNER'),
       ('role-org', 'role-target', 'BILLING'),
       ('role-org', 'role-failure', 'MEMBER'),
       ('role-concurrent', 'race-actor', 'OWNER'),
       ('role-concurrent', 'race-owner-2', 'OWNER')`,
  );

  const capability = createAccountsMembershipRoleChangeCapability(
    createAccountsAccountAccessCapability(
      createPostgresAccountsAccountAccessRepository(connectionString),
    ),
    createPostgresAccountsMembershipRoleChangeRepository(connectionString),
  );

  const before = await client.query<{ createdAt: Date }>(
    `SELECT "createdAt" FROM "Membership"
      WHERE "accountId" = 'role-org' AND "userId" = 'role-target'`,
  );
  const originalCreatedAt = before.rows[0]?.createdAt;
  if (!originalCreatedAt) throw new Error("Role-change target fixture missing.");

  const changed = await capability.update({
    actorPrincipalId: "role-actor",
    accountId: "role-org",
    targetPrincipalId: "role-target",
    role: "LICENSE_MANAGER",
  });
  if (changed.status !== "UPDATED") {
    throw new Error(`Expected role update, received ${JSON.stringify(changed)}`);
  }
  if (
    changed.auditIntent.from !== "BILLING" ||
    changed.auditIntent.to !== "LICENSE_MANAGER" ||
    changed.membership.role !== "LICENSE_MANAGER" ||
    changed.membership.createdAt.toISOString() !== originalCreatedAt.toISOString()
  ) {
    throw new Error(`Role change did not preserve membership identity: ${JSON.stringify(changed)}`);
  }

  const promoted = await capability.update({
    actorPrincipalId: "role-actor",
    accountId: "role-org",
    targetPrincipalId: "role-target",
    role: "OWNER",
  });
  if (promoted.status !== "UPDATED" || promoted.membership.role !== "OWNER") {
    throw new Error(`Expected target promotion to OWNER, received ${JSON.stringify(promoted)}`);
  }

  const demotedActorMembership = await capability.update({
    actorPrincipalId: "role-actor",
    accountId: "role-org",
    targetPrincipalId: "role-actor",
    role: "BILLING",
  });
  if (demotedActorMembership.status !== "UPDATED") {
    throw new Error(
      `Expected OWNER membership demotion while another OWNER exists, received ${JSON.stringify(demotedActorMembership)}`,
    );
  }

  const lastOwnerRejected = await capability.update({
    actorPrincipalId: "role-actor",
    accountId: "role-org",
    targetPrincipalId: "role-target",
    role: "MEMBER",
  });
  if (
    lastOwnerRejected.status !== "REJECTED" ||
    lastOwnerRejected.code !== "LAST_OWNER_REQUIRED"
  ) {
    throw new Error(`Expected LAST_OWNER_REQUIRED, received ${JSON.stringify(lastOwnerRejected)}`);
  }
  const lastOwnerState = await client.query<{ role: string }>(
    `SELECT "role" FROM "Membership"
      WHERE "accountId" = 'role-org' AND "userId" = 'role-target'`,
  );
  if (lastOwnerState.rows[0]?.role !== "OWNER") {
    throw new Error("Last-owner rejection did not preserve OWNER role.");
  }

  const missing = await capability.update({
    actorPrincipalId: "role-actor",
    accountId: "role-org",
    targetPrincipalId: "missing-member",
    role: "MEMBER",
  });
  if (missing.status !== "REJECTED" || missing.code !== "MEMBER_NOT_FOUND") {
    throw new Error(`Expected MEMBER_NOT_FOUND, received ${JSON.stringify(missing)}`);
  }

  const suspended = await capability.update({
    actorPrincipalId: "role-actor",
    accountId: "role-suspended",
    targetPrincipalId: "anything",
    role: "MEMBER",
  });
  if (suspended.status !== "REJECTED" || suspended.code !== "SUSPENDED_ACCOUNT") {
    throw new Error(`Expected SUSPENDED_ACCOUNT, received ${JSON.stringify(suspended)}`);
  }

  const race = await Promise.all([
    capability.update({
      actorPrincipalId: "race-actor",
      accountId: "role-concurrent",
      targetPrincipalId: "race-actor",
      role: "BILLING",
    }),
    capability.update({
      actorPrincipalId: "race-actor",
      accountId: "role-concurrent",
      targetPrincipalId: "race-owner-2",
      role: "BILLING",
    }),
  ]);
  const raceUpdated = race.filter((result) => result.status === "UPDATED").length;
  const raceRejected = race.filter(
    (result) => result.status === "REJECTED" && result.code === "LAST_OWNER_REQUIRED",
  ).length;
  if (raceUpdated !== 1 || raceRejected !== 1) {
    throw new Error(`Concurrent OWNER demotions violated last-owner safety: ${JSON.stringify(race)}`);
  }
  const remainingOwners = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS "count" FROM "Membership"
      WHERE "accountId" = 'role-concurrent' AND "role" = 'OWNER'`,
  );
  if (Number(remainingOwners.rows[0]?.count ?? "0") !== 1) {
    throw new Error("Concurrent OWNER demotions did not leave exactly one OWNER membership.");
  }

  await client.query(`
    CREATE FUNCTION fail_membership_role_change() RETURNS trigger AS $$
    BEGIN
      IF NEW."accountId" = 'role-org' AND NEW."userId" = 'role-failure' THEN
        RAISE EXCEPTION 'forced role change failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER membership_role_change_failure
      BEFORE UPDATE ON "Membership"
      FOR EACH ROW EXECUTE FUNCTION fail_membership_role_change();
  `);

  const failed = await capability.update({
    actorPrincipalId: "role-actor",
    accountId: "role-org",
    targetPrincipalId: "role-failure",
    role: "BILLING",
  });
  if (failed.status !== "FAILED" || failed.code !== "PERSISTENCE_UNAVAILABLE") {
    throw new Error(`Expected persistence failure, received ${JSON.stringify(failed)}`);
  }
  const failedState = await client.query<{ role: string }>(
    `SELECT "role" FROM "Membership"
      WHERE "accountId" = 'role-org' AND "userId" = 'role-failure'`,
  );
  if (failedState.rows[0]?.role !== "MEMBER") {
    throw new Error("Failed role change did not preserve the previous Membership role.");
  }

  console.log("Accounts membership role change PostgreSQL certification GREEN");
} finally {
  await client.end();
}

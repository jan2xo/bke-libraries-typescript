import { Client } from "pg";
import { createAccountsAccountAccessCapability } from "../logic/account-access";
import { createAccountsOrganizationCloseCapability } from "../logic/organization-close";
import { createPostgresAccountsAccountAccessRepository } from "../prisma/repositories/postgres-account-access-repository";
import { createPostgresAccountsOrganizationCloseRepository } from "../prisma/repositories/postgres-organization-close-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Accounts organization close certification.");
}

const client = new Client({ connectionString });
await client.connect();
try {
  const userTable = await client.query<{ exists: string | null }>(
    `SELECT to_regclass('public."User"')::text AS "exists"`,
  );
  if (userTable.rows[0]?.exists !== null) {
    throw new Error("Accounts organization close certification must not depend on an Identity User table.");
  }

  const oldClosedAt = new Date("2026-01-01T00:00:00.000Z");
  await client.query(
    `INSERT INTO "CustomerAccount"
       ("id", "type", "displayName", "ownerId", "billingEmail", "taxId", "lifecycleState", "closureRequestedAt", "closedAt")
     VALUES
       ('close-active', 'ORGANIZATION', 'Close Active', 'close-owner', 'active-close@example.com', 'ACTIVE-TAX', 'ACTIVE', NULL, NULL),
       ('close-suspended', 'ORGANIZATION', 'Close Suspended', 'close-owner', 'suspended-close@example.com', NULL, 'SUSPENDED', NULL, NULL),
       ('close-closed', 'ORGANIZATION', 'Close Closed', 'close-owner', 'closed-close@example.com', NULL, 'CLOSED', $1, $1),
       ('close-individual', 'INDIVIDUAL', 'Close Individual', 'close-owner', 'individual-close@example.com', NULL, 'ACTIVE', NULL, NULL),
       ('close-forbidden', 'ORGANIZATION', 'Close Forbidden', 'close-other-owner', 'forbidden-close@example.com', NULL, 'ACTIVE', NULL, NULL),
       ('close-failure', 'ORGANIZATION', 'Close Failure', 'close-owner', 'failure-close@example.com', NULL, 'ACTIVE', NULL, NULL)`,
    [oldClosedAt],
  );
  await client.query(
    `INSERT INTO "Membership" ("accountId", "userId", "role")
     VALUES ('close-forbidden', 'close-billing', 'BILLING')`,
  );

  let currentNow = new Date("2026-09-01T08:10:00.000Z");
  const capability = createAccountsOrganizationCloseCapability(
    createAccountsAccountAccessCapability(
      createPostgresAccountsAccountAccessRepository(connectionString),
    ),
    createPostgresAccountsOrganizationCloseRepository(connectionString),
    { now: () => currentNow },
  );

  const activeClosed = await capability.close({
    actorPrincipalId: "close-owner",
    accountId: "close-active",
  });
  if (activeClosed.status !== "CLOSED") {
    throw new Error(`Expected active organization close, received ${JSON.stringify(activeClosed)}`);
  }
  if (
    activeClosed.account.closureRequestedAt.toISOString() !== currentNow.toISOString() ||
    activeClosed.account.closedAt.toISOString() !== currentNow.toISOString() ||
    activeClosed.auditIntent.action !== "ORGANIZATION_CLOSED"
  ) {
    throw new Error(`Organization close returned incorrect timestamps/audit intent: ${JSON.stringify(activeClosed)}`);
  }
  const activeState = await client.query<{
    lifecycleState: string;
    closureRequestedAt: Date | null;
    closedAt: Date | null;
    displayName: string;
    ownerId: string;
    billingEmail: string;
    taxId: string | null;
  }>(
    `SELECT "lifecycleState", "closureRequestedAt", "closedAt", "displayName", "ownerId", "billingEmail", "taxId"
       FROM "CustomerAccount" WHERE "id" = 'close-active'`,
  );
  const activeRow = activeState.rows[0];
  if (
    !activeRow ||
    activeRow.lifecycleState !== "CLOSED" ||
    activeRow.closureRequestedAt?.toISOString() !== currentNow.toISOString() ||
    activeRow.closedAt?.toISOString() !== currentNow.toISOString() ||
    activeRow.displayName !== "Close Active" ||
    activeRow.ownerId !== "close-owner" ||
    activeRow.billingEmail !== "active-close@example.com" ||
    activeRow.taxId !== "ACTIVE-TAX"
  ) {
    throw new Error(`Active organization close persisted incorrect state: ${JSON.stringify(activeRow)}`);
  }

  currentNow = new Date("2026-09-01T08:11:00.000Z");
  const suspendedClosed = await capability.close({
    actorPrincipalId: "close-owner",
    accountId: "close-suspended",
  });
  if (suspendedClosed.status !== "CLOSED") {
    throw new Error(`V1 permits SUSPENDED organization close, received ${JSON.stringify(suspendedClosed)}`);
  }
  const suspendedState = await client.query<{ lifecycleState: string; closedAt: Date | null }>(
    `SELECT "lifecycleState", "closedAt" FROM "CustomerAccount" WHERE "id" = 'close-suspended'`,
  );
  if (
    suspendedState.rows[0]?.lifecycleState !== "CLOSED" ||
    suspendedState.rows[0]?.closedAt?.toISOString() !== currentNow.toISOString()
  ) {
    throw new Error("Suspended organization did not transition to CLOSED with the supplied clock.");
  }

  currentNow = new Date("2026-09-01T08:12:00.000Z");
  const repeatedClose = await capability.close({
    actorPrincipalId: "close-owner",
    accountId: "close-closed",
  });
  if (repeatedClose.status !== "CLOSED") {
    throw new Error(`Expected repeated V1 close to succeed, received ${JSON.stringify(repeatedClose)}`);
  }
  const repeatedState = await client.query<{
    closureRequestedAt: Date | null;
    closedAt: Date | null;
  }>(
    `SELECT "closureRequestedAt", "closedAt" FROM "CustomerAccount" WHERE "id" = 'close-closed'`,
  );
  if (
    repeatedState.rows[0]?.closureRequestedAt?.toISOString() !== currentNow.toISOString() ||
    repeatedState.rows[0]?.closedAt?.toISOString() !== currentNow.toISOString() ||
    repeatedState.rows[0]?.closedAt?.toISOString() === oldClosedAt.toISOString()
  ) {
    throw new Error("Repeated close did not refresh V1 closure timestamps.");
  }

  const individual = await capability.close({
    actorPrincipalId: "close-owner",
    accountId: "close-individual",
  });
  if (individual.status !== "REJECTED" || individual.code !== "ACCOUNT_NOT_ORGANIZATION") {
    throw new Error(`Expected ACCOUNT_NOT_ORGANIZATION, received ${JSON.stringify(individual)}`);
  }

  const forbidden = await capability.close({
    actorPrincipalId: "close-billing",
    accountId: "close-forbidden",
  });
  if (forbidden.status !== "REJECTED" || forbidden.code !== "ACCOUNT_ROLE_FORBIDDEN") {
    throw new Error(`Expected ACCOUNT_ROLE_FORBIDDEN, received ${JSON.stringify(forbidden)}`);
  }
  const forbiddenState = await client.query<{ lifecycleState: string }>(
    `SELECT "lifecycleState" FROM "CustomerAccount" WHERE "id" = 'close-forbidden'`,
  );
  if (forbiddenState.rows[0]?.lifecycleState !== "ACTIVE") {
    throw new Error("Forbidden organization close mutated lifecycle state.");
  }

  await client.query(`
    CREATE FUNCTION fail_organization_close() RETURNS trigger AS $$
    BEGIN
      IF NEW."id" = 'close-failure' AND NEW."lifecycleState" = 'CLOSED' THEN
        RAISE EXCEPTION 'forced organization close failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER organization_close_failure
      BEFORE UPDATE ON "CustomerAccount"
      FOR EACH ROW EXECUTE FUNCTION fail_organization_close();
  `);

  currentNow = new Date("2026-09-01T08:13:00.000Z");
  const failed = await capability.close({
    actorPrincipalId: "close-owner",
    accountId: "close-failure",
  });
  if (failed.status !== "FAILED" || failed.code !== "PERSISTENCE_UNAVAILABLE") {
    throw new Error(`Expected persistence failure, received ${JSON.stringify(failed)}`);
  }
  const failedState = await client.query<{
    lifecycleState: string;
    closureRequestedAt: Date | null;
    closedAt: Date | null;
  }>(
    `SELECT "lifecycleState", "closureRequestedAt", "closedAt"
       FROM "CustomerAccount" WHERE "id" = 'close-failure'`,
  );
  if (
    failedState.rows[0]?.lifecycleState !== "ACTIVE" ||
    failedState.rows[0]?.closureRequestedAt !== null ||
    failedState.rows[0]?.closedAt !== null
  ) {
    throw new Error("Failed organization close did not roll back lifecycle/timestamp mutation.");
  }

  console.log("Accounts organization close PostgreSQL certification GREEN");
} finally {
  await client.end();
}

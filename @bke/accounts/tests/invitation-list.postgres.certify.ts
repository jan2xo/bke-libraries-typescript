import { Client } from "pg";
import { createAccountsAccountAccessCapability } from "../logic/account-access";
import { createAccountsInvitationExpirationCapability } from "../logic/invitation-expiration";
import { createAccountsInvitationListCapability } from "../logic/invitation-list";
import { createPostgresAccountsAccountAccessRepository } from "../prisma/repositories/postgres-account-access-repository";
import { createPostgresAccountsInvitationExpirationRepository } from "../prisma/repositories/postgres-invitation-expiration-repository";
import { createPostgresAccountsInvitationListRepository } from "../prisma/repositories/postgres-invitation-list-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Accounts invitation list certification.");
}

const now = new Date("2026-09-01T08:00:00.000Z");
const client = new Client({ connectionString });
await client.connect();
try {
  const userTable = await client.query<{ exists: string | null }>(
    `SELECT to_regclass('public."User"')::text AS "exists"`,
  );
  if (userTable.rows[0]?.exists !== null) {
    throw new Error("Accounts invitation list certification must not depend on an Identity User table.");
  }

  await client.query(
    `INSERT INTO "CustomerAccount"
       ("id", "type", "displayName", "ownerId", "billingEmail", "lifecycleState")
     VALUES
       ('list-org', 'ORGANIZATION', 'List Org', 'list-owner', 'list@example.com', 'ACTIVE'),
       ('list-other', 'ORGANIZATION', 'Other Org', 'other-owner', 'other@example.com', 'ACTIVE'),
       ('list-suspended', 'ORGANIZATION', 'Suspended Org', 'suspended-owner', 'suspended@example.com', 'SUSPENDED'),
       ('list-individual', 'INDIVIDUAL', 'Individual', 'individual-owner', 'individual@example.com', 'ACTIVE')`,
  );
  await client.query(
    `INSERT INTO "Membership" ("accountId", "userId", "role")
     VALUES ('list-org', 'list-member', 'MEMBER')`,
  );
  await client.query(
    `INSERT INTO "Invitation"
       ("id", "accountId", "email", "role", "tokenHash", "status", "expiresAt", "createdAt")
     VALUES
       ('list-pending', 'list-org', 'pending@example.com', 'BILLING', 'list-hash-pending', 'PENDING', '2026-09-10T00:00:00.000Z', '2026-09-01T07:00:00.000Z'),
       ('list-due', 'list-org', 'due@example.com', 'MEMBER', 'list-hash-due', 'PENDING', '2026-09-01T08:00:00.000Z', '2026-09-01T06:00:00.000Z'),
       ('list-accepted', 'list-org', 'accepted@example.com', 'OWNER', 'list-hash-accepted', 'ACCEPTED', '2026-09-12T00:00:00.000Z', '2026-09-01T05:00:00.000Z'),
       ('list-revoked', 'list-org', 'revoked@example.com', 'LICENSE_MANAGER', 'list-hash-revoked', 'REVOKED', '2026-09-13T00:00:00.000Z', '2026-09-01T04:00:00.000Z'),
       ('list-expired-existing', 'list-org', 'expired@example.com', 'MEMBER', 'list-hash-expired', 'EXPIRED', '2026-08-30T00:00:00.000Z', '2026-09-01T03:00:00.000Z'),
       ('other-due', 'list-other', 'other-due@example.com', 'MEMBER', 'other-hash-due', 'PENDING', '2026-08-31T00:00:00.000Z', '2026-09-01T02:00:00.000Z')`,
  );

  const expiration = createAccountsInvitationExpirationCapability(
    createPostgresAccountsInvitationExpirationRepository(connectionString),
    { now: () => new Date(now.getTime()) },
  );
  const capability = createAccountsInvitationListCapability(
    expiration,
    createAccountsAccountAccessCapability(
      createPostgresAccountsAccountAccessRepository(connectionString),
    ),
    createPostgresAccountsInvitationListRepository(connectionString),
  );

  const listed = await capability.list({
    actorPrincipalId: "list-owner",
    accountId: "list-org",
  });
  if (listed.status !== "LISTED") {
    throw new Error(`Expected invitation list, received ${JSON.stringify(listed)}`);
  }
  if (listed.expiration.count < 2) {
    throw new Error(`Expected at least our two globally due invitations, received ${listed.expiration.count}`);
  }
  const expirationTargets = new Set(
    listed.expiration.auditIntents.map((intent) => intent.targetId),
  );
  if (!expirationTargets.has("list-due") || !expirationTargets.has("other-due")) {
    throw new Error(
      `Global expiration omitted invitation-list fixtures: ${JSON.stringify([...expirationTargets].sort())}`,
    );
  }
  const ids = listed.invitations.map((invitation) => invitation.id);
  if (
    ids.join(",") !==
    "list-pending,list-due,list-accepted,list-revoked,list-expired-existing"
  ) {
    throw new Error(`Invitation ordering diverged from V1: ${JSON.stringify(ids)}`);
  }
  const statuses = Object.fromEntries(
    listed.invitations.map((invitation) => [invitation.id, invitation.status]),
  );
  if (
    statuses["list-pending"] !== "PENDING" ||
    statuses["list-due"] !== "EXPIRED" ||
    statuses["list-accepted"] !== "ACCEPTED" ||
    statuses["list-revoked"] !== "REVOKED" ||
    statuses["list-expired-existing"] !== "EXPIRED"
  ) {
    throw new Error(`Invitation list did not return all lifecycle statuses: ${JSON.stringify(statuses)}`);
  }

  await client.query(
    `INSERT INTO "Invitation"
       ("id", "accountId", "email", "role", "tokenHash", "status", "expiresAt", "createdAt")
     VALUES
       ('other-due-unauthorized', 'list-other', 'unauthorized@example.com', 'MEMBER', 'other-hash-unauthorized', 'PENDING', '2026-08-31T12:00:00.000Z', '2026-09-01T07:30:00.000Z')`,
  );
  const forbidden = await capability.list({
    actorPrincipalId: "list-member",
    accountId: "list-org",
  });
  if (forbidden.status !== "REJECTED" || forbidden.code !== "ACCOUNT_ROLE_FORBIDDEN") {
    throw new Error(`Expected ACCOUNT_ROLE_FORBIDDEN, received ${JSON.stringify(forbidden)}`);
  }
  if (
    forbidden.expiration.count !== 1 ||
    forbidden.expiration.auditIntents[0]?.targetId !== "other-due-unauthorized"
  ) {
    throw new Error("Unauthorized listing did not preserve expiration-before-authorization semantics.");
  }
  const unauthorizedExpiry = await client.query<{ status: string }>(
    `SELECT "status" FROM "Invitation" WHERE "id" = 'other-due-unauthorized'`,
  );
  if (unauthorizedExpiry.rows[0]?.status !== "EXPIRED") {
    throw new Error("Unauthorized listing failed to persist the global expiration sweep.");
  }

  const suspended = await capability.list({
    actorPrincipalId: "suspended-owner",
    accountId: "list-suspended",
  });
  if (suspended.status !== "LISTED") {
    throw new Error(`Suspended organization invitation listing diverged from V1: ${JSON.stringify(suspended)}`);
  }

  const individual = await capability.list({
    actorPrincipalId: "individual-owner",
    accountId: "list-individual",
  });
  if (individual.status !== "REJECTED" || individual.code !== "ACCOUNT_NOT_ORGANIZATION") {
    throw new Error(`Expected explicit organization boundary, received ${JSON.stringify(individual)}`);
  }

  console.log("Accounts invitation list PostgreSQL certification GREEN");
} finally {
  await client.end();
}

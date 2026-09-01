import { createHash } from "node:crypto";
import { Client } from "pg";
import { createAccountsAccountAccessCapability } from "../logic/account-access";
import { createAccountsInvitationRevocationCapability } from "../logic/invitation-revocation";
import { createPostgresAccountsAccountAccessRepository } from "../prisma/repositories/postgres-account-access-repository";
import { createPostgresAccountsInvitationRevocationRepository } from "../prisma/repositories/postgres-invitation-revocation-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Accounts invitation revocation certification.");
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const client = new Client({ connectionString });
await client.connect();
try {
  const userTable = await client.query<{ exists: string | null }>(
    `SELECT to_regclass('public."User"')::text AS "exists"`,
  );
  if (userTable.rows[0]?.exists !== null) {
    throw new Error("Accounts invitation revocation certification must not depend on an Identity User table.");
  }

  await client.query(
    `INSERT INTO "CustomerAccount"
       ("id", "type", "displayName", "ownerId", "billingEmail", "lifecycleState")
     VALUES
       ('revoke-org', 'ORGANIZATION', 'Revoke Org', 'revoke-owner', 'billing@example.com', 'ACTIVE'),
       ('revoke-suspended', 'ORGANIZATION', 'Suspended Org', 'revoke-owner', 'suspended@example.com', 'SUSPENDED')`,
  );
  await client.query(
    `INSERT INTO "Membership" ("accountId", "userId", "role")
     VALUES ('revoke-org', 'revoke-member', 'MEMBER')`,
  );

  const expiry = new Date("2026-02-01T00:00:00.000Z");
  await client.query(
    `INSERT INTO "Invitation"
       ("id", "accountId", "email", "role", "tokenHash", "status", "expiresAt")
     VALUES
       ('revoke-pending', 'revoke-org', 'invite@example.com', 'BILLING', $1, 'PENDING', $2),
       ('revoke-accepted', 'revoke-org', 'accepted@example.com', 'MEMBER', $3, 'ACCEPTED', $2),
       ('revoke-suspended-invite', 'revoke-suspended', 'suspended@example.com', 'MEMBER', $4, 'PENDING', $2),
       ('revoke-failure', 'revoke-org', 'failure@example.com', 'OWNER', $5, 'PENDING', $2)`,
    [
      hash("pending-raw-token"),
      expiry,
      hash("accepted-raw-token"),
      hash("suspended-raw-token"),
      hash("failure-raw-token"),
    ],
  );

  const capability = createAccountsInvitationRevocationCapability(
    createAccountsAccountAccessCapability(
      createPostgresAccountsAccountAccessRepository(connectionString),
    ),
    createPostgresAccountsInvitationRevocationRepository(connectionString),
  );

  const revoked = await capability.revoke({
    actorPrincipalId: "revoke-owner",
    invitationId: "revoke-pending",
  });
  if (revoked.status !== "REVOKED") {
    throw new Error(`Expected REVOKED, received ${JSON.stringify(revoked)}`);
  }
  if (
    revoked.invitation.accountId !== "revoke-org" ||
    revoked.invitation.email !== "invite@example.com" ||
    revoked.invitation.role !== "BILLING" ||
    revoked.invitation.status !== "REVOKED" ||
    revoked.invitation.expiresAt.toISOString() !== expiry.toISOString()
  ) {
    throw new Error(`Revocation mutated stable invitation fields: ${JSON.stringify(revoked.invitation)}`);
  }

  const stored = await client.query<{
    accountId: string;
    email: string;
    role: string;
    tokenHash: string;
    status: string;
    expiresAt: Date;
  }>(
    `SELECT "accountId", "email", "role", "tokenHash", "status", "expiresAt"
       FROM "Invitation" WHERE "id" = 'revoke-pending'`,
  );
  const storedRow = stored.rows[0];
  if (!storedRow) throw new Error("Revoked invitation disappeared.");
  if (
    storedRow.accountId !== "revoke-org" ||
    storedRow.email !== "invite@example.com" ||
    storedRow.role !== "BILLING" ||
    storedRow.tokenHash !== hash("pending-raw-token") ||
    storedRow.status !== "REVOKED" ||
    storedRow.expiresAt.toISOString() !== expiry.toISOString()
  ) {
    throw new Error(`Revocation changed fields other than status: ${JSON.stringify(storedRow)}`);
  }

  const missing = await capability.revoke({
    actorPrincipalId: "revoke-owner",
    invitationId: "missing-invite",
  });
  if (missing.status !== "REJECTED" || missing.code !== "INVITATION_NOT_FOUND") {
    throw new Error(`Expected INVITATION_NOT_FOUND, received ${JSON.stringify(missing)}`);
  }

  const unauthorizedNonPending = await capability.revoke({
    actorPrincipalId: "revoke-member",
    invitationId: "revoke-accepted",
  });
  if (
    unauthorizedNonPending.status !== "REJECTED" ||
    unauthorizedNonPending.code !== "ACCOUNT_ROLE_FORBIDDEN"
  ) {
    throw new Error(
      `Expected authorization failure before pending-state failure, received ${JSON.stringify(unauthorizedNonPending)}`,
    );
  }

  const accepted = await capability.revoke({
    actorPrincipalId: "revoke-owner",
    invitationId: "revoke-accepted",
  });
  if (accepted.status !== "REJECTED" || accepted.code !== "INVITATION_NOT_PENDING") {
    throw new Error(`Expected INVITATION_NOT_PENDING, received ${JSON.stringify(accepted)}`);
  }

  const suspended = await capability.revoke({
    actorPrincipalId: "revoke-owner",
    invitationId: "revoke-suspended-invite",
  });
  if (suspended.status !== "REJECTED" || suspended.code !== "SUSPENDED_ACCOUNT") {
    throw new Error(`Expected SUSPENDED_ACCOUNT, received ${JSON.stringify(suspended)}`);
  }

  await client.query(`
    CREATE FUNCTION fail_invitation_revocation() RETURNS trigger AS $$
    BEGIN
      IF NEW."id" = 'revoke-failure' AND NEW."status" = 'REVOKED' THEN
        RAISE EXCEPTION 'forced revocation failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER invitation_revocation_failure
      BEFORE UPDATE ON "Invitation"
      FOR EACH ROW EXECUTE FUNCTION fail_invitation_revocation();
  `);

  const failed = await capability.revoke({
    actorPrincipalId: "revoke-owner",
    invitationId: "revoke-failure",
  });
  if (failed.status !== "FAILED" || failed.code !== "PERSISTENCE_UNAVAILABLE") {
    throw new Error(`Expected persistence failure, received ${JSON.stringify(failed)}`);
  }

  const failedState = await client.query<{
    accountId: string;
    email: string;
    role: string;
    tokenHash: string;
    status: string;
    expiresAt: Date;
  }>(
    `SELECT "accountId", "email", "role", "tokenHash", "status", "expiresAt"
       FROM "Invitation" WHERE "id" = 'revoke-failure'`,
  );
  const failedRow = failedState.rows[0];
  if (!failedRow) throw new Error("Failed-revocation invitation disappeared.");
  if (
    failedRow.accountId !== "revoke-org" ||
    failedRow.email !== "failure@example.com" ||
    failedRow.role !== "OWNER" ||
    failedRow.tokenHash !== hash("failure-raw-token") ||
    failedRow.status !== "PENDING" ||
    failedRow.expiresAt.toISOString() !== expiry.toISOString()
  ) {
    throw new Error("Failed revocation did not preserve the entire invitation state.");
  }

  console.log("Accounts invitation revocation PostgreSQL certification GREEN");
} finally {
  await client.end();
}

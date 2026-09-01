import { createHash } from "node:crypto";
import { Client } from "pg";
import { createAccountsAccountAccessCapability } from "../logic/account-access";
import { createAccountsInvitationResendCapability } from "../logic/invitation-resend";
import { createPostgresAccountsAccountAccessRepository } from "../prisma/repositories/postgres-account-access-repository";
import { createPostgresAccountsInvitationResendRepository } from "../prisma/repositories/postgres-invitation-resend-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Accounts invitation resend certification.");

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const client = new Client({ connectionString });
await client.connect();
try {
  const userTable = await client.query<{ exists: string | null }>(
    `SELECT to_regclass('public."User"')::text AS "exists"`,
  );
  if (userTable.rows[0]?.exists !== null) {
    throw new Error("Accounts invitation resend certification must not depend on an Identity User table.");
  }

  await client.query(
    `INSERT INTO "CustomerAccount"
       ("id", "type", "displayName", "ownerId", "billingEmail", "lifecycleState")
     VALUES
       ('resend-org', 'ORGANIZATION', 'Resend Org', 'resend-owner', 'billing@example.com', 'ACTIVE'),
       ('resend-suspended', 'ORGANIZATION', 'Suspended Org', 'resend-owner', 'suspended@example.com', 'SUSPENDED')`,
  );
  await client.query(
    `INSERT INTO "Membership" ("accountId", "userId", "role")
     VALUES ('resend-org', 'resend-member', 'MEMBER')`,
  );

  const oldExpiry = new Date("2025-12-20T00:00:00.000Z");
  const collisionTargetExpiry = new Date("2025-12-21T00:00:00.000Z");
  await client.query(
    `INSERT INTO "Invitation"
       ("id", "accountId", "email", "role", "tokenHash", "status", "expiresAt")
     VALUES
       ('resend-pending', 'resend-org', 'invite@example.com', 'BILLING', $1, 'PENDING', $2),
       ('resend-accepted', 'resend-org', 'accepted@example.com', 'MEMBER', $3, 'ACCEPTED', '2026-02-01T00:00:00Z'),
       ('resend-suspended-invite', 'resend-suspended', 'suspended@example.com', 'MEMBER', $4, 'PENDING', '2026-02-01T00:00:00Z'),
       ('collision-holder', 'resend-org', 'holder@example.com', 'MEMBER', $5, 'PENDING', '2026-02-01T00:00:00Z'),
       ('resend-collision-target', 'resend-org', 'collision@example.com', 'OWNER', $6, 'PENDING', $7)`,
    [
      hash("old-raw-token"),
      oldExpiry,
      hash("accepted-old-token"),
      hash("suspended-old-token"),
      hash("collision-raw-token"),
      hash("collision-target-old-token"),
      collisionTargetExpiry,
    ],
  );

  const rawTokens = ["new-raw-token", "collision-raw-token"];
  const capability = createAccountsInvitationResendCapability(
    createAccountsAccountAccessCapability(
      createPostgresAccountsAccountAccessRepository(connectionString),
    ),
    createPostgresAccountsInvitationResendRepository(connectionString),
    {
      issue: () => {
        const rawToken = rawTokens.shift();
        if (!rawToken) throw new Error("No resend token remaining.");
        return { rawToken, tokenHash: hash(rawToken) };
      },
    },
    { now: () => new Date("2026-01-01T00:00:00.000Z") },
  );

  const resent = await capability.resend({
    actorPrincipalId: "resend-owner",
    invitationId: "resend-pending",
  });
  if (resent.status !== "RESENT" || resent.token !== "new-raw-token") {
    throw new Error(`Expected RESENT, received ${JSON.stringify(resent)}`);
  }
  if (resent.invitation.expiresAt.toISOString() !== "2026-01-08T00:00:00.000Z") {
    throw new Error("Resend default expiry is not exactly seven days from the injected clock.");
  }
  if (
    resent.invitation.accountId !== "resend-org" ||
    resent.invitation.email !== "invite@example.com" ||
    resent.invitation.role !== "BILLING" ||
    resent.invitation.status !== "PENDING"
  ) {
    throw new Error(`Resend mutated stable invitation fields: ${JSON.stringify(resent.invitation)}`);
  }

  const stored = await client.query<{
    tokenHash: string;
    expiresAt: Date;
    accountId: string;
    email: string;
    role: string;
    status: string;
  }>(
    `SELECT "tokenHash", "expiresAt", "accountId", "email", "role", "status"
       FROM "Invitation" WHERE "id" = 'resend-pending'`,
  );
  const storedRow = stored.rows[0];
  if (!storedRow) throw new Error("Resent invitation disappeared.");
  if (storedRow.tokenHash !== hash("new-raw-token") || storedRow.tokenHash === "new-raw-token") {
    throw new Error("Resend did not replace the old token with SHA-256-only material.");
  }
  if (storedRow.tokenHash === hash("old-raw-token")) {
    throw new Error("Resend left the old invitation token active.");
  }
  if (
    storedRow.accountId !== "resend-org" ||
    storedRow.email !== "invite@example.com" ||
    storedRow.role !== "BILLING" ||
    storedRow.status !== "PENDING"
  ) {
    throw new Error(`Stable invitation fields changed in persistence: ${JSON.stringify(storedRow)}`);
  }

  const missing = await capability.resend({
    actorPrincipalId: "resend-owner",
    invitationId: "missing-invite",
  });
  if (missing.status !== "REJECTED" || missing.code !== "INVITATION_NOT_FOUND") {
    throw new Error(`Expected INVITATION_NOT_FOUND, received ${JSON.stringify(missing)}`);
  }

  const unauthorizedNonPending = await capability.resend({
    actorPrincipalId: "resend-member",
    invitationId: "resend-accepted",
  });
  if (
    unauthorizedNonPending.status !== "REJECTED" ||
    unauthorizedNonPending.code !== "ACCOUNT_ROLE_FORBIDDEN"
  ) {
    throw new Error(
      `Expected authorization failure before pending-state failure, received ${JSON.stringify(unauthorizedNonPending)}`,
    );
  }

  const accepted = await capability.resend({
    actorPrincipalId: "resend-owner",
    invitationId: "resend-accepted",
  });
  if (accepted.status !== "REJECTED" || accepted.code !== "INVITATION_NOT_PENDING") {
    throw new Error(`Expected INVITATION_NOT_PENDING, received ${JSON.stringify(accepted)}`);
  }

  const suspended = await capability.resend({
    actorPrincipalId: "resend-owner",
    invitationId: "resend-suspended-invite",
  });
  if (suspended.status !== "REJECTED" || suspended.code !== "SUSPENDED_ACCOUNT") {
    throw new Error(`Expected SUSPENDED_ACCOUNT, received ${JSON.stringify(suspended)}`);
  }

  const collision = await capability.resend({
    actorPrincipalId: "resend-owner",
    invitationId: "resend-collision-target",
  });
  if (collision.status !== "FAILED" || collision.code !== "PERSISTENCE_UNAVAILABLE") {
    throw new Error(`Expected collision persistence failure, received ${JSON.stringify(collision)}`);
  }
  const collisionState = await client.query<{ tokenHash: string; expiresAt: Date; status: string }>(
    `SELECT "tokenHash", "expiresAt", "status"
       FROM "Invitation" WHERE "id" = 'resend-collision-target'`,
  );
  const collisionRow = collisionState.rows[0];
  if (!collisionRow) throw new Error("Collision target disappeared.");
  if (
    collisionRow.tokenHash !== hash("collision-target-old-token") ||
    collisionRow.expiresAt.toISOString() !== collisionTargetExpiry.toISOString() ||
    collisionRow.status !== "PENDING"
  ) {
    throw new Error("Failed resend did not preserve the previous token/expiry/status atomically.");
  }

  console.log("Accounts invitation resend PostgreSQL certification GREEN");
} finally {
  await client.end();
}

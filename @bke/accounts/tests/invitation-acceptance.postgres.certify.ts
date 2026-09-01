import { createHash } from "node:crypto";
import { Client } from "pg";
import { createAccountsInvitationAcceptanceCapability } from "../logic/invitation-acceptance";
import { createPostgresAccountsInvitationAcceptanceRepository } from "../prisma/repositories/postgres-invitation-acceptance-repository";
import { createCryptoAccountsInvitationTokenHasher } from "../providers/crypto-invitation-token-hasher";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Accounts invitation acceptance certification.");
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const now = new Date("2026-02-01T00:00:00.000Z");
const client = new Client({ connectionString });
await client.connect();
try {
  const userTable = await client.query<{ exists: string | null }>(
    `SELECT to_regclass('public."User"')::text AS "exists"`,
  );
  if (userTable.rows[0]?.exists !== null) {
    throw new Error("Accounts invitation acceptance certification must not depend on an Identity User table.");
  }

  await client.query(
    `INSERT INTO "CustomerAccount"
       ("id", "type", "displayName", "ownerId", "billingEmail", "lifecycleState")
     VALUES
       ('accept-active-org', 'ORGANIZATION', 'Acceptance Active', 'accept-owner-a', 'a@example.com', 'ACTIVE'),
       ('accept-suspended-org', 'ORGANIZATION', 'Acceptance Suspended', 'accept-owner-b', 'b@example.com', 'SUSPENDED'),
       ('accept-closed-org', 'ORGANIZATION', 'Acceptance Closed', 'accept-owner-c', 'c@example.com', 'CLOSED'),
       ('accept-individual', 'INDIVIDUAL', 'Acceptance Individual', 'accept-owner-d', 'd@example.com', 'ACTIVE')`,
  );

  await client.query(
    `INSERT INTO "Membership" ("accountId", "userId", "role")
     VALUES ('accept-active-org', 'principal-success', 'MEMBER')`,
  );
  const membershipBefore = await client.query<{ createdAt: Date }>(
    `SELECT "createdAt" FROM "Membership"
      WHERE "accountId" = 'accept-active-org' AND "userId" = 'principal-success'`,
  );

  const invitations = [
    ["accept-success", "accept-active-org", "member@example.com", "LICENSE_MANAGER", "accept-success-token", "PENDING", "2026-02-02T00:00:00Z"],
    ["accept-exact", "accept-active-org", "exact@example.com", "MEMBER", "accept-exact-token", "PENDING", "2026-02-01T00:00:00Z"],
    ["accept-mismatch", "accept-active-org", "expected@example.com", "BILLING", "accept-mismatch-token", "PENDING", "2026-02-02T00:00:00Z"],
    ["accept-already", "accept-active-org", "already@example.com", "MEMBER", "accept-already-token", "ACCEPTED", "2026-02-02T00:00:00Z"],
    ["accept-suspended", "accept-suspended-org", "suspended@example.com", "MEMBER", "accept-suspended-token", "PENDING", "2026-02-02T00:00:00Z"],
    ["accept-closed", "accept-closed-org", "closed@example.com", "MEMBER", "accept-closed-token", "PENDING", "2026-02-02T00:00:00Z"],
    ["accept-individual-invite", "accept-individual", "individual@example.com", "MEMBER", "accept-individual-token", "PENDING", "2026-02-02T00:00:00Z"],
    ["accept-fail", "accept-active-org", "fail@example.com", "BILLING", "accept-fail-token", "PENDING", "2026-02-02T00:00:00Z"],
  ] as const;

  for (const [id, accountId, email, role, rawToken, status, expiresAt] of invitations) {
    await client.query(
      `INSERT INTO "Invitation"
         ("id", "accountId", "email", "role", "tokenHash", "status", "expiresAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, accountId, email, role, sha256(rawToken), status, expiresAt],
    );
  }

  const capability = createAccountsInvitationAcceptanceCapability(
    createPostgresAccountsInvitationAcceptanceRepository(connectionString),
    createCryptoAccountsInvitationTokenHasher(),
    { now: () => now },
  );

  const accepted = await capability.accept({
    principalId: "principal-success",
    email: "Member@Example.COM",
    token: "accept-success-token",
  });
  if (
    accepted.status !== "ACCEPTED" ||
    accepted.membership.accountId !== "accept-active-org" ||
    accepted.membership.userId !== "principal-success" ||
    accepted.membership.role !== "LICENSE_MANAGER" ||
    accepted.auditIntent.invitationId !== "accept-success"
  ) {
    throw new Error(`Acceptance happy path mismatch: ${JSON.stringify(accepted)}`);
  }
  const successState = await client.query<{ status: string; tokenHash: string }>(
    `SELECT "status", "tokenHash" FROM "Invitation" WHERE "id" = 'accept-success'`,
  );
  if (
    successState.rows[0]?.status !== "ACCEPTED" ||
    successState.rows[0]?.tokenHash !== sha256("accept-success-token") ||
    successState.rows[0]?.tokenHash === "accept-success-token"
  ) {
    throw new Error("Acceptance did not preserve hashed-token-only invitation state.");
  }
  const membershipAfter = await client.query<{ role: string; createdAt: Date }>(
    `SELECT "role", "createdAt" FROM "Membership"
      WHERE "accountId" = 'accept-active-org' AND "userId" = 'principal-success'`,
  );
  if (
    membershipAfter.rows[0]?.role !== "LICENSE_MANAGER" ||
    membershipAfter.rows[0]?.createdAt.toISOString() !== membershipBefore.rows[0]?.createdAt.toISOString()
  ) {
    throw new Error("Acceptance did not upsert the existing membership role correctly.");
  }

  const second = await capability.accept({
    principalId: "principal-success",
    email: "member@example.com",
    token: "accept-success-token",
  });
  if (second.status !== "REJECTED" || second.code !== "INVITATION_NOT_PENDING") {
    throw new Error(`Second acceptance was not rejected as consumed: ${JSON.stringify(second)}`);
  }

  const exact = await capability.accept({
    principalId: "principal-exact",
    email: "exact@example.com",
    token: "accept-exact-token",
  });
  if (exact.status !== "REJECTED" || exact.code !== "INVITATION_EXPIRED") {
    throw new Error(`Exact-deadline invitation was not expired: ${JSON.stringify(exact)}`);
  }

  const mismatch = await capability.accept({
    principalId: "principal-mismatch",
    email: "wrong@example.com",
    token: "accept-mismatch-token",
  });
  if (mismatch.status !== "REJECTED" || mismatch.code !== "INVITATION_EMAIL_MISMATCH") {
    throw new Error(`Email mismatch classification failed: ${JSON.stringify(mismatch)}`);
  }

  const missing = await capability.accept({
    principalId: "principal-missing",
    email: "missing@example.com",
    token: "no-such-token",
  });
  if (missing.status !== "REJECTED" || missing.code !== "INVITATION_NOT_FOUND") {
    throw new Error(`Missing invitation classification failed: ${JSON.stringify(missing)}`);
  }

  for (const [token, email, expectedCode, invitationId] of [
    ["accept-suspended-token", "suspended@example.com", "SUSPENDED_ACCOUNT", "accept-suspended"],
    ["accept-closed-token", "closed@example.com", "CLOSED_ACCOUNT", "accept-closed"],
    ["accept-individual-token", "individual@example.com", "ACCOUNT_NOT_ORGANIZATION", "accept-individual-invite"],
  ] as const) {
    const result = await capability.accept({ principalId: `principal-${invitationId}`, email, token });
    if (result.status !== "REJECTED" || result.code !== expectedCode) {
      throw new Error(`${invitationId} classification failed: ${JSON.stringify(result)}`);
    }
    const state = await client.query<{ status: string }>(
      `SELECT "status" FROM "Invitation" WHERE "id" = $1`,
      [invitationId],
    );
    if (state.rows[0]?.status !== "PENDING") {
      throw new Error(`${invitationId} did not roll the ACCEPTED claim back to PENDING.`);
    }
  }

  await client.query(`
    CREATE OR REPLACE FUNCTION "bke_fail_invitation_acceptance_membership"() RETURNS trigger AS $$
    BEGIN
      IF NEW."userId" = 'principal-fail' THEN
        RAISE EXCEPTION 'forced invitation acceptance membership failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER "bke_fail_invitation_acceptance_membership_trigger"
      BEFORE INSERT OR UPDATE ON "Membership"
      FOR EACH ROW EXECUTE FUNCTION "bke_fail_invitation_acceptance_membership"();
  `);

  const failed = await capability.accept({
    principalId: "principal-fail",
    email: "fail@example.com",
    token: "accept-fail-token",
  });
  if (failed.status !== "FAILED" || failed.code !== "PERSISTENCE_UNAVAILABLE") {
    throw new Error(`Expected membership persistence failure: ${JSON.stringify(failed)}`);
  }
  const failedState = await client.query<{ status: string }>(
    `SELECT "status" FROM "Invitation" WHERE "id" = 'accept-fail'`,
  );
  const failedMembership = await client.query<{ count: string }>(
    `SELECT count(*)::text AS "count" FROM "Membership"
      WHERE "accountId" = 'accept-active-org' AND "userId" = 'principal-fail'`,
  );
  if (failedState.rows[0]?.status !== "PENDING" || failedMembership.rows[0]?.count !== "0") {
    throw new Error("Membership failure did not roll back the invitation claim atomically.");
  }

  console.log("Accounts invitation acceptance PostgreSQL certification GREEN");
} finally {
  await client.end();
}

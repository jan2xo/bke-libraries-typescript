import { Client } from "pg";
import { createAccountsOrganizationAccountCreationCapability } from "../logic/organization-account-creation";
import { createPostgresAccountsOrganizationAccountCreationRepository } from "../prisma/repositories/postgres-organization-account-creation-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Accounts organization certification.");

const client = new Client({ connectionString });
await client.connect();
try {
  const userTable = await client.query<{ user_table: string | null }>(
    `SELECT to_regclass('public."User"')::text AS user_table`,
  );
  if (userTable.rows[0]?.user_table !== null) {
    throw new Error("Accounts organization certification must not require an Identity User table.");
  }

  await client.query(`
    CREATE OR REPLACE FUNCTION accounts_fail_owner_membership_cert()
    RETURNS trigger AS $$
    BEGIN
      IF NEW."userId" = 'org-owner-fail' THEN
        RAISE EXCEPTION 'forced Accounts organization membership failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await client.query(`
    CREATE TRIGGER accounts_fail_owner_membership_cert_trigger
    BEFORE INSERT ON "Membership"
    FOR EACH ROW EXECUTE FUNCTION accounts_fail_owner_membership_cert();
  `);

  const ids = ["org-cert-fail", "org-cert-success"];
  const capability = createAccountsOrganizationAccountCreationCapability(
    createPostgresAccountsOrganizationAccountCreationRepository(connectionString),
    { issue: () => ids.shift() ?? "unexpected-id" },
  );

  const failed = await capability.create({
    ownerPrincipalId: "org-owner-fail",
    displayName: "Rollback Org",
    legalName: "Rollback Organization",
    billingEmail: "rollback@example.com",
  });
  if (failed.status !== "FAILED" || failed.code !== "PERSISTENCE_UNAVAILABLE") {
    throw new Error(`Expected forced persistence failure, received ${JSON.stringify(failed)}`);
  }

  const rollbackCounts = await client.query<{
    accounts: string;
    profiles: string;
    memberships: string;
  }>(`
    SELECT
      (SELECT COUNT(*)::text FROM "CustomerAccount" WHERE "id" = 'org-cert-fail') AS accounts,
      (SELECT COUNT(*)::text FROM "OrganizationProfile" WHERE "accountId" = 'org-cert-fail') AS profiles,
      (SELECT COUNT(*)::text FROM "Membership" WHERE "accountId" = 'org-cert-fail') AS memberships
  `);
  const rollback = rollbackCounts.rows[0];
  if (!rollback || rollback.accounts !== "0" || rollback.profiles !== "0" || rollback.memberships !== "0") {
    throw new Error(`Organization transaction did not fully roll back: ${JSON.stringify(rollback)}`);
  }

  await client.query(`DROP TRIGGER accounts_fail_owner_membership_cert_trigger ON "Membership"`);
  await client.query(`DROP FUNCTION accounts_fail_owner_membership_cert()`);

  const created = await capability.create({
    ownerPrincipalId: "org-owner-success",
    displayName: "  Certified Org  ",
    legalName: "  Certified Organization Inc  ",
    billingEmail: " CERTIFIED@EXAMPLE.COM ",
    registrationNumber: " REG-777 ",
    taxId: " TAX-777 ",
  });
  if (created.status !== "CREATED") {
    throw new Error(`Expected CREATED, received ${JSON.stringify(created)}`);
  }
  if (
    created.account.id !== "org-cert-success" ||
    created.account.type !== "ORGANIZATION" ||
    created.account.ownerId !== "org-owner-success" ||
    created.account.billingEmail !== "certified@example.com" ||
    created.organization.legalName !== "Certified Organization Inc" ||
    created.organization.registrationNumber !== "REG-777" ||
    created.ownerMembership.role !== "OWNER" ||
    created.auditIntent.action !== "ORGANIZATION_CREATED"
  ) {
    throw new Error(`Unexpected organization result: ${JSON.stringify(created)}`);
  }

  const persisted = await client.query<{ account_count: string; profile_count: string; owner_count: string }>(`
    SELECT
      (SELECT COUNT(*)::text FROM "CustomerAccount" WHERE "id" = 'org-cert-success' AND "type" = 'ORGANIZATION' AND "lifecycleState" = 'ACTIVE') AS account_count,
      (SELECT COUNT(*)::text FROM "OrganizationProfile" WHERE "accountId" = 'org-cert-success' AND "legalName" = 'Certified Organization Inc' AND "registrationNumber" = 'REG-777') AS profile_count,
      (SELECT COUNT(*)::text FROM "Membership" WHERE "accountId" = 'org-cert-success' AND "userId" = 'org-owner-success' AND "role" = 'OWNER') AS owner_count
  `);
  const state = persisted.rows[0];
  if (!state || state.account_count !== "1" || state.profile_count !== "1" || state.owner_count !== "1") {
    throw new Error(`Organization aggregate persistence mismatch: ${JSON.stringify(state)}`);
  }

  console.log("Accounts organization account creation PostgreSQL certification GREEN");
} finally {
  await client.end();
}

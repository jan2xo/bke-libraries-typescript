import { Client } from "pg";
import { createAccountsAccountAccessCapability } from "../logic/account-access";
import { createAccountsOrganizationProfileUpdateCapability } from "../logic/organization-profile-update";
import { createPostgresAccountsAccountAccessRepository } from "../prisma/repositories/postgres-account-access-repository";
import { createPostgresAccountsOrganizationProfileUpdateRepository } from "../prisma/repositories/postgres-organization-profile-update-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Accounts profile certification.");

const client = new Client({ connectionString });
await client.connect();
try {
  await client.query(`
    INSERT INTO "CustomerAccount"
      ("id", "type", "displayName", "ownerId", "billingEmail", "taxId", "lifecycleState")
    VALUES
      ('profile-cert', 'ORGANIZATION', 'Original Org', 'profile-owner', 'old@example.com', NULL, 'ACTIVE'),
      ('profile-rollback', 'ORGANIZATION', 'Rollback Original', 'rollback-owner', 'rollback@example.com', NULL, 'ACTIVE');
    INSERT INTO "OrganizationProfile" ("accountId", "legalName", "registrationNumber")
    VALUES
      ('profile-cert', 'Original Legal', 'OLD-REG'),
      ('profile-rollback', 'Rollback Legal', 'ROLLBACK-REG');
    INSERT INTO "Membership" ("accountId", "userId", "role")
    VALUES
      ('profile-cert', 'profile-owner', 'OWNER'),
      ('profile-cert', 'profile-billing', 'BILLING'),
      ('profile-rollback', 'rollback-owner', 'OWNER');
  `);

  const accountAccess = createAccountsAccountAccessCapability(
    createPostgresAccountsAccountAccessRepository(connectionString),
  );
  const capability = createAccountsOrganizationProfileUpdateCapability(
    accountAccess,
    createPostgresAccountsOrganizationProfileUpdateRepository(connectionString),
  );

  const billing = await capability.update({
    actorPrincipalId: "profile-billing",
    accountId: "profile-cert",
    billingEmail: " BILLING.NEW@EXAMPLE.COM ",
    taxId: " TAX-NEW ",
  });
  if (billing.status !== "UPDATED" || billing.state.account.billingEmail !== "billing.new@example.com") {
    throw new Error(`Billing update failed: ${JSON.stringify(billing)}`);
  }

  const billingForbidden = await capability.update({
    actorPrincipalId: "profile-billing",
    accountId: "profile-cert",
    legalName: "Billing Cannot Rename",
  });
  if (
    billingForbidden.status !== "REJECTED" ||
    billingForbidden.code !== "ACCOUNT_ROLE_FORBIDDEN"
  ) {
    throw new Error(`Billing authorization boundary failed: ${JSON.stringify(billingForbidden)}`);
  }

  const owner = await capability.update({
    actorPrincipalId: "profile-owner",
    accountId: "profile-cert",
    displayName: "  Renamed Org  ",
    legalName: "  Renamed Legal  ",
    registrationNumber: null,
    billingEmail: " OWNER.NEW@EXAMPLE.COM ",
  });
  if (
    owner.status !== "UPDATED" ||
    owner.state.account.displayName !== "Renamed Org" ||
    owner.state.account.billingEmail !== "owner.new@example.com" ||
    owner.state.organization.legalName !== "Renamed Legal" ||
    owner.state.organization.registrationNumber !== null ||
    owner.auditIntent.action !== "ORGANIZATION_PROFILE_UPDATED"
  ) {
    throw new Error(`Owner update failed: ${JSON.stringify(owner)}`);
  }

  await client.query(`
    CREATE OR REPLACE FUNCTION accounts_fail_profile_update_cert()
    RETURNS trigger AS $$
    BEGIN
      IF NEW."accountId" = 'profile-rollback' THEN
        RAISE EXCEPTION 'forced Accounts profile update failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER accounts_fail_profile_update_cert_trigger
    BEFORE UPDATE ON "OrganizationProfile"
    FOR EACH ROW EXECUTE FUNCTION accounts_fail_profile_update_cert();
  `);

  const failed = await capability.update({
    actorPrincipalId: "rollback-owner",
    accountId: "profile-rollback",
    displayName: "Should Roll Back",
    legalName: "Should Also Roll Back",
  });
  if (failed.status !== "FAILED" || failed.code !== "PERSISTENCE_UNAVAILABLE") {
    throw new Error(`Expected forced persistence failure: ${JSON.stringify(failed)}`);
  }
  const rollbackState = await client.query<{ displayName: string; legalName: string }>(`
    SELECT a."displayName", o."legalName"
      FROM "CustomerAccount" a
      JOIN "OrganizationProfile" o ON o."accountId" = a."id"
     WHERE a."id" = 'profile-rollback'
  `);
  const rollback = rollbackState.rows[0];
  if (!rollback || rollback.displayName !== "Rollback Original" || rollback.legalName !== "Rollback Legal") {
    throw new Error(`Profile transaction did not roll back: ${JSON.stringify(rollback)}`);
  }

  console.log("Accounts organization profile update PostgreSQL certification GREEN");
} finally {
  await client.end();
}

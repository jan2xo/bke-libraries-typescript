import { Client } from "pg";
import { createAccountsAccountAccessCapability } from "../logic/account-access";
import { createPostgresAccountsAccountAccessRepository } from "../prisma/repositories/postgres-account-access-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Accounts access certification.");

const client = new Client({ connectionString });
await client.connect();
try {
  const userTable = await client.query<{ user_table: string | null }>(
    `SELECT to_regclass('public."User"')::text AS user_table`,
  );
  if (userTable.rows[0]?.user_table !== null) {
    throw new Error("Accounts access certification must not require an Identity User table.");
  }

  await client.query(
    `INSERT INTO "CustomerAccount"
       ("id", "type", "displayName", "ownerId", "billingEmail", "lifecycleState")
     VALUES
       ('accounts-access-cert', 'ORGANIZATION', 'Access Cert Org', 'owner-cert', 'billing@example.com', 'ACTIVE')`,
  );
  await client.query(
    `INSERT INTO "Membership" ("accountId", "userId", "role") VALUES
       ('accounts-access-cert', 'billing-cert', 'BILLING'),
       ('accounts-access-cert', 'license-cert', 'LICENSE_MANAGER'),
       ('accounts-access-cert', 'member-cert', 'MEMBER')`,
  );

  const capability = createAccountsAccountAccessCapability(
    createPostgresAccountsAccountAccessRepository(connectionString),
  );

  const owner = await capability.authorize({
    principalId: "owner-cert",
    accountId: "accounts-access-cert",
    requiredCapability: "MANAGE_MEMBERS",
  });
  if (owner.status !== "AUTHORIZED" || owner.effectiveRole !== "OWNER") {
    throw new Error(`Owner authorization failed: ${JSON.stringify(owner)}`);
  }

  const billing = await capability.authorize({
    principalId: "billing-cert",
    accountId: "accounts-access-cert",
    requiredCapability: "VIEW_PAYMENTS",
  });
  if (billing.status !== "AUTHORIZED" || billing.effectiveRole !== "BILLING") {
    throw new Error(`Billing authorization failed: ${JSON.stringify(billing)}`);
  }

  const billingForbidden = await capability.authorize({
    principalId: "billing-cert",
    accountId: "accounts-access-cert",
    requiredCapability: "VIEW_LICENSES",
  });
  if (
    billingForbidden.status !== "REJECTED" ||
    billingForbidden.code !== "ACCOUNT_ROLE_FORBIDDEN"
  ) {
    throw new Error(`Billing forbidden proof failed: ${JSON.stringify(billingForbidden)}`);
  }

  const license = await capability.authorize({
    principalId: "license-cert",
    accountId: "accounts-access-cert",
    requiredCapability: "ASSIGN_LICENSE",
  });
  if (license.status !== "AUTHORIZED" || license.effectiveRole !== "LICENSE_MANAGER") {
    throw new Error(`License manager authorization failed: ${JSON.stringify(license)}`);
  }

  const member = await capability.authorize({
    principalId: "member-cert",
    accountId: "accounts-access-cert",
  });
  if (member.status !== "AUTHORIZED" || member.effectiveRole !== "MEMBER") {
    throw new Error(`Member access proof failed: ${JSON.stringify(member)}`);
  }

  const outsider = await capability.authorize({
    principalId: "outsider-cert",
    accountId: "accounts-access-cert",
  });
  if (outsider.status !== "REJECTED" || outsider.code !== "NOT_FOUND") {
    throw new Error(`Outsider proof failed: ${JSON.stringify(outsider)}`);
  }

  await client.query(
    `UPDATE "CustomerAccount" SET "lifecycleState" = 'SUSPENDED' WHERE "id" = 'accounts-access-cert'`,
  );

  const suspendedPurchase = await capability.authorize({
    principalId: "billing-cert",
    accountId: "accounts-access-cert",
    requiredCapability: "PURCHASE",
  });
  if (
    suspendedPurchase.status !== "REJECTED" ||
    suspendedPurchase.code !== "ACCOUNT_NOT_ACTIVE"
  ) {
    throw new Error(
      `Suspended account PURCHASE must be rejected: ${JSON.stringify(suspendedPurchase)}`,
    );
  }

  const suspendedOwner = await capability.authorize({
    principalId: "owner-cert",
    accountId: "accounts-access-cert",
    requiredCapability: "CLOSE_ACCOUNT",
  });
  if (suspendedOwner.status !== "AUTHORIZED") {
    throw new Error(
      `Non-purchase account access must remain available when role policy permits it: ${JSON.stringify(suspendedOwner)}`,
    );
  }

  console.log("Accounts account access PostgreSQL certification GREEN");
} finally {
  await client.end();
}

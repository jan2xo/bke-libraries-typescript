import { Client } from "pg";
import { createAccountsAccountAccessCapability } from "../logic/account-access";
import { createAccountsPurchaseAccessCapability } from "../logic/purchase-access";
import { createPostgresAccountsAccountAccessRepository } from "../prisma/repositories/postgres-account-access-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Accounts purchase access certification.");

const client = new Client({ connectionString });
await client.connect();
try {
  await client.query(
    `INSERT INTO "CustomerAccount"
       ("id", "type", "displayName", "ownerId", "billingEmail", "lifecycleState")
     VALUES
       ('accounts-purchase-cert', 'ORGANIZATION', 'Purchase Cert Org', 'purchase-owner', 'billing@example.com', 'ACTIVE')`,
  );
  await client.query(
    `INSERT INTO "Membership" ("accountId", "userId", "role") VALUES
       ('accounts-purchase-cert', 'purchase-billing', 'BILLING'),
       ('accounts-purchase-cert', 'purchase-member', 'MEMBER')`,
  );

  const purchase = createAccountsPurchaseAccessCapability(
    createAccountsAccountAccessCapability(
      createPostgresAccountsAccountAccessRepository(connectionString),
    ),
  );

  const billing = await purchase.authorize({
    principalId: "purchase-billing",
    accountId: "accounts-purchase-cert",
  });
  if (billing.status !== "AUTHORIZED" || billing.effectiveRole !== "BILLING") {
    throw new Error(`Active billing purchase authorization failed: ${JSON.stringify(billing)}`);
  }

  await client.query(
    `UPDATE "CustomerAccount" SET "lifecycleState" = 'SUSPENDED' WHERE "id" = 'accounts-purchase-cert'`,
  );

  const suspended = await purchase.authorize({
    principalId: "purchase-billing",
    accountId: "accounts-purchase-cert",
  });
  if (suspended.status !== "REJECTED" || suspended.code !== "ACCOUNT_NOT_ACTIVE") {
    throw new Error(`Suspended purchase must reject: ${JSON.stringify(suspended)}`);
  }

  const member = await purchase.authorize({
    principalId: "purchase-member",
    accountId: "accounts-purchase-cert",
  });
  if (member.status !== "REJECTED" || member.code !== "ACCOUNT_ROLE_FORBIDDEN") {
    throw new Error(`Role policy must precede lifecycle disclosure: ${JSON.stringify(member)}`);
  }

  console.log("Accounts purchase access PostgreSQL certification GREEN");
} finally {
  await client.end();
}

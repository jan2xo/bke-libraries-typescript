import { Client } from "pg";
import { createAccountsAccountLifecycleCapability } from "../logic/account-lifecycle";
import { createPostgresAccountsAccountLifecycleRepository } from "../prisma/repositories/postgres-account-lifecycle-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Accounts lifecycle certification.");
}

const client = new Client({ connectionString });
await client.connect();
try {
  const userTable = await client.query<{ user_table: string | null }>(
    `SELECT to_regclass('public."User"')::text AS user_table`,
  );
  if (userTable.rows[0]?.user_table !== null) {
    throw new Error("Accounts lifecycle certification must not require an Identity User table.");
  }

  await client.query(
    `INSERT INTO "CustomerAccount"
       ("id", "type", "displayName", "ownerId", "billingEmail", "lifecycleState")
     VALUES
       ('accounts-lifecycle-cert', 'ORGANIZATION', 'Lifecycle Cert Org', 'owner-lifecycle-cert', 'lifecycle@example.com', 'ACTIVE')`,
  );

  const capability = createAccountsAccountLifecycleCapability(
    createPostgresAccountsAccountLifecycleRepository(connectionString),
  );

  const active = await capability.findByAccountId("accounts-lifecycle-cert");
  if (
    active.status !== "FOUND" ||
    active.value.accountId !== "accounts-lifecycle-cert" ||
    active.value.lifecycleState !== "ACTIVE"
  ) {
    throw new Error(`ACTIVE lifecycle lookup failed: ${JSON.stringify(active)}`);
  }

  await client.query(
    `UPDATE "CustomerAccount"
        SET "lifecycleState" = 'SUSPENDED'
      WHERE "id" = 'accounts-lifecycle-cert'`,
  );
  const suspended = await capability.findByAccountId("accounts-lifecycle-cert");
  if (suspended.status !== "FOUND" || suspended.value.lifecycleState !== "SUSPENDED") {
    throw new Error(`SUSPENDED lifecycle lookup failed: ${JSON.stringify(suspended)}`);
  }

  const missing = await capability.findByAccountId("accounts-lifecycle-missing");
  if (missing.status !== "NOT_FOUND") {
    throw new Error(`Missing lifecycle lookup failed: ${JSON.stringify(missing)}`);
  }

  const invalid = await capability.findByAccountId("   ");
  if (invalid.status !== "FAILED" || invalid.code !== "INVALID_INPUT") {
    throw new Error(`Invalid lifecycle lookup failed: ${JSON.stringify(invalid)}`);
  }

  console.log("Accounts lifecycle PostgreSQL certification GREEN");
} finally {
  await client.query(
    `DELETE FROM "CustomerAccount" WHERE "id" = 'accounts-lifecycle-cert'`,
  ).catch(() => undefined);
  await client.end();
}

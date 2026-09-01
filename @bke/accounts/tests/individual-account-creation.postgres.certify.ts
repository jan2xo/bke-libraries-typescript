import { Client } from "pg";
import { createAccountsIndividualAccountCreationCapability } from "../logic/individual-account-creation";
import { createPostgresAccountsIndividualAccountCreationRepository } from "../prisma/repositories/postgres-individual-account-creation-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Accounts certification.");

const client = new Client({ connectionString });
await client.connect();
try {
  const userTable = await client.query<{ user_table: string | null }>(
    `SELECT to_regclass('public."User"')::text AS user_table`,
  );
  if (userTable.rows[0]?.user_table !== null) {
    throw new Error("Accounts certification must run without an Identity User table.");
  }

  const externalForeignKeys = await client.query<{ count: string }>(`
    SELECT COUNT(*)::text AS count
      FROM pg_constraint c
      JOIN pg_class source_table ON source_table.oid = c.conrelid
      JOIN pg_class target_table ON target_table.oid = c.confrelid
     WHERE c.contype = 'f'
       AND source_table.relname IN ('CustomerAccount', 'OrganizationProfile', 'Membership', 'Invitation')
       AND target_table.relname NOT IN ('CustomerAccount', 'OrganizationProfile', 'Membership', 'Invitation')
  `);
  if (externalForeignKeys.rows[0]?.count !== "0") {
    throw new Error("Accounts schema contains a foreign key outside the Accounts aggregate.");
  }

  const repository = createPostgresAccountsIndividualAccountCreationRepository(connectionString);
  const capability = createAccountsIndividualAccountCreationCapability(repository, {
    issue: () => "accounts-individual-cert-1",
  });

  const created = await capability.create({
    ownerId: " identity-principal-does-not-exist-in-this-database ",
    displayName: "  Certification Customer  ",
    billingEmail: "  CERTIFICATION@EXAMPLE.COM ",
  });
  if (created.status !== "CREATED") {
    throw new Error(`Expected CREATED, received ${JSON.stringify(created)}`);
  }

  const persisted = await client.query<{
    id: string;
    type: string;
    displayName: string;
    ownerId: string;
    billingEmail: string;
    taxId: string | null;
    lifecycleState: string;
  }>(
    `SELECT "id", "type", "displayName", "ownerId", "billingEmail", "taxId", "lifecycleState"
       FROM "CustomerAccount"
      WHERE "id" = $1`,
    ["accounts-individual-cert-1"],
  );
  const row = persisted.rows[0];
  if (
    !row ||
    row.type !== "INDIVIDUAL" ||
    row.displayName !== "Certification Customer" ||
    row.ownerId !== "identity-principal-does-not-exist-in-this-database" ||
    row.billingEmail !== "certification@example.com" ||
    row.taxId !== null ||
    row.lifecycleState !== "ACTIVE"
  ) {
    throw new Error(`Unexpected persisted account: ${JSON.stringify(row)}`);
  }

  const memberships = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM "Membership" WHERE "accountId" = $1`,
    ["accounts-individual-cert-1"],
  );
  if (memberships.rows[0]?.count !== "0") {
    throw new Error("INDIVIDUAL account creation must not create Membership rows.");
  }

  const duplicate = await capability.create({
    ownerId: "another-principal",
    displayName: "Another Customer",
    billingEmail: "another@example.com",
  });
  if (duplicate.status !== "FAILED" || duplicate.code !== "PERSISTENCE_UNAVAILABLE") {
    throw new Error(`Expected duplicate id persistence failure, received ${JSON.stringify(duplicate)}`);
  }

  console.log("Accounts individual account creation PostgreSQL certification GREEN");
} finally {
  await client.end();
}

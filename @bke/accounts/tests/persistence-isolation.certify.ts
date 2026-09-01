import { Client } from "pg";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Accounts persistence isolation certification.");
}

const allowedTables = new Set([
  "_prisma_migrations",
  "CustomerAccount",
  "OrganizationProfile",
  "Membership",
  "Invitation",
]);
const allowedEnums = new Set([
  "AccountsAccountType",
  "AccountsMemberRole",
  "AccountsLifecycleState",
  "AccountsInvitationStatus",
]);

const client = new Client({ connectionString });
await client.connect();
try {
  const tables = await client.query<{ tablename: string }>(
    `SELECT tablename
       FROM pg_catalog.pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename`,
  );
  const tableNames = tables.rows.map((row) => row.tablename);
  const foreignTables = tableNames.filter((table) => !allowedTables.has(table));
  const missingTables = [...allowedTables].filter((table) => !tableNames.includes(table));
  if (foreignTables.length > 0 || missingTables.length > 0) {
    throw new Error(
      `Accounts persistence isolation failed: foreign=${JSON.stringify(foreignTables)} missing=${JSON.stringify(missingTables)} all=${JSON.stringify(tableNames)}`,
    );
  }

  const enums = await client.query<{ typname: string }>(
    `SELECT t.typname
       FROM pg_catalog.pg_type t
       JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typtype = 'e'
      ORDER BY t.typname`,
  );
  const enumNames = enums.rows.map((row) => row.typname);
  const foreignEnums = enumNames.filter((name) => !allowedEnums.has(name));
  const missingEnums = [...allowedEnums].filter((name) => !enumNames.includes(name));
  if (foreignEnums.length > 0 || missingEnums.length > 0) {
    throw new Error(
      `Accounts enum isolation failed: foreign=${JSON.stringify(foreignEnums)} missing=${JSON.stringify(missingEnums)} all=${JSON.stringify(enumNames)}`,
    );
  }

  const sequences = await client.query<{ sequencename: string }>(
    `SELECT sequencename
       FROM pg_catalog.pg_sequences
      WHERE schemaname = 'public'
      ORDER BY sequencename`,
  );
  if (sequences.rows.length > 0) {
    throw new Error(
      `Accounts baseline unexpectedly owns PostgreSQL sequences: ${JSON.stringify(sequences.rows.map((row) => row.sequencename))}`,
    );
  }

  console.log(
    `Accounts persistence isolation GREEN: ${tableNames.length - 1} business tables, ${enumNames.length} enums, Prisma migration ledger only, no foreign tables or sequences`,
  );
} finally {
  await client.end();
}

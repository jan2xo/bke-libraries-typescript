import { Client } from "pg";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Entitlements isolation certification.");

const expectedTables = new Set(["Entitlement", "_prisma_migrations"]);
const expectedEnums = new Set(["EntitlementStatus"]);
const expectedChecks = new Set(["Entitlement_quantity_check", "Entitlement_validity_check"]);

const client = new Client({ connectionString });
await client.connect();
try {
  const tables = await client.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
  );
  const actualTables = new Set(tables.rows.map((row) => row.table_name));
  const unexpectedTables = [...actualTables].filter((table) => !expectedTables.has(table));
  const missingTables = [...expectedTables].filter((table) => !actualTables.has(table));
  if (unexpectedTables.length || missingTables.length) {
    throw new Error(
      `Entitlements persistence ownership drift: unexpected=${unexpectedTables.join(",") || "none"} missing=${missingTables.join(",") || "none"}`,
    );
  }

  const enums = await client.query<{ typname: string }>(`
    SELECT t.typname
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public' AND t.typtype = 'e'
  `);
  const actualEnums = new Set(enums.rows.map((row) => row.typname));
  if ([...actualEnums].some((name) => !expectedEnums.has(name)) || [...expectedEnums].some((name) => !actualEnums.has(name))) {
    throw new Error(`Entitlements enum ownership drift: ${[...actualEnums].join(",")}`);
  }

  const foreignKeys = await client.query<{ conname: string }>(`
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class source ON source.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = source.relnamespace
     WHERE c.contype = 'f' AND n.nspname = 'public'
  `);
  if (foreignKeys.rowCount) {
    throw new Error(`Entitlements must not own cross-domain foreign keys: ${foreignKeys.rows.map((row) => row.conname).join(",")}`);
  }

  const checks = await client.query<{ conname: string }>(`
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class source ON source.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = source.relnamespace
     WHERE c.contype = 'c' AND n.nspname = 'public' AND source.relname = 'Entitlement'
  `);
  const actualChecks = new Set(checks.rows.map((row) => row.conname));
  for (const check of expectedChecks) {
    if (!actualChecks.has(check)) throw new Error(`Entitlements is missing persistence invariant ${check}`);
  }
} finally {
  await client.end();
}

console.log("Entitlements persistence isolation GREEN: one private Entitlement table, no foreign keys");

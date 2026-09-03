import { Client } from "pg";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Legal isolation certification.");

const expectedTables = new Set([
  "LegalAcceptance",
  "LegalDocument",
  "LegalDocumentVersion",
  "_prisma_migrations",
]);
const legalBusinessTables = new Set([
  "LegalAcceptance",
  "LegalDocument",
  "LegalDocumentVersion",
]);

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
  const unexpected = [...actualTables].filter((table) => !expectedTables.has(table));
  const missing = [...expectedTables].filter((table) => !actualTables.has(table));
  if (unexpected.length || missing.length) {
    throw new Error(
      `Legal persistence ownership drift: unexpected=${unexpected.join(",") || "none"} missing=${missing.join(",") || "none"}`,
    );
  }

  const foreignKeys = await client.query<{ source_table: string; target_table: string }>(`
    SELECT source.relname AS source_table, target.relname AS target_table
      FROM pg_constraint c
      JOIN pg_class source ON source.oid = c.conrelid
      JOIN pg_class target ON target.oid = c.confrelid
      JOIN pg_namespace n ON n.oid = source.relnamespace
     WHERE c.contype = 'f' AND n.nspname = 'public'
  `);
  for (const key of foreignKeys.rows) {
    if (!legalBusinessTables.has(key.source_table) || !legalBusinessTables.has(key.target_table)) {
      throw new Error(`Legal persistence contains foreign-domain FK ${key.source_table} -> ${key.target_table}`);
    }
  }

  const enums = await client.query<{ typname: string }>(`
    SELECT t.typname
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public' AND t.typtype = 'e'
     ORDER BY t.typname
  `);
  if (enums.rows.length !== 0) {
    throw new Error(`Legal persistence unexpectedly owns enums: ${enums.rows.map((row) => row.typname).join(",")}`);
  }

  console.log(
    "Legal persistence isolation GREEN: three owned business tables, internal-only foreign keys, no owned enums, and no foreign-domain tables",
  );
} finally {
  await client.end();
}

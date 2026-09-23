import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { Client } from "pg";

const root = resolve("@bke/entitlements/migrations");
const directories = readdirSync(root)
  .filter((name) => {
    const dir = join(root, name);
    return statSync(dir).isDirectory() && statSync(join(dir, "migration.sql"), { throwIfNoEntry: false })?.isFile();
  })
  .sort();

const expectedOrder = [
  "0001_entitlements_durable_right_baseline",
  "0001a_entitlements_durable_right_revoked_enum",
  "0002_entitlements_durable_right_revocation",
];
for (const expected of expectedOrder) {
  if (!directories.includes(expected)) {
    throw new Error(`Missing Entitlements migration: ${expected}`);
  }
}
const positions = expectedOrder.map((name) => directories.indexOf(name));
if (!(positions[0] < positions[1] && positions[1] < positions[2])) {
  throw new Error(`Unsafe Entitlements migration order: ${directories.join(", ")}`);
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  for (const name of directories) {
    const sql = readFileSync(join(root, name, "migration.sql"), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`Transactional Entitlements migration failed: ${name}`, { cause: error });
    }
  }

  const enumRows = await client.query<{ enumlabel: string }>(`
    SELECT enumlabel
      FROM pg_enum
      JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
     WHERE pg_type.typname = 'EntitlementStatus'
     ORDER BY enumsortorder
  `);
  if (!enumRows.rows.some((row) => row.enumlabel === "REVOKED")) {
    throw new Error("REVOKED EntitlementStatus is missing after transactional migrations.");
  }

  const constraintRows = await client.query<{ definition: string }>(`
    SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
     WHERE conname = 'Entitlement_revocation_shape_check'
  `);
  if (constraintRows.rowCount !== 1 || !constraintRows.rows[0].definition.includes("REVOKED")) {
    throw new Error("Entitlement revocation shape constraint is missing after transactional migrations.");
  }

  console.log(`Entitlements transactional migration ordering GREEN: ${directories.join(" -> ")}`);
} finally {
  await client.end();
}

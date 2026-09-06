import assert from "node:assert/strict";
import { Client } from "pg";
import { createPostgresLicensingTransferPolicyCapability } from "../prisma/repositories/postgres-transfer-policy-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Licensing transfer-policy PostgreSQL certification.");

const setup = new Client({ connectionString });
await setup.connect();
try {
  await setup.query(`DELETE FROM "LicensePolicy"`);
  await setup.query(
    `INSERT INTO "LicensePolicy" ("id", "productId", "name", "transferable") VALUES
      ('policy-true', 'product-a', 'Transferable', TRUE),
      ('policy-false', 'product-a', 'Non-transferable', FALSE),
      ('x'' OR ''1''=''1', 'product-b', 'SQL-like', TRUE)`,
  );
  const before = await setup.query(`SELECT "id", "productId", "name", "transferable" FROM "LicensePolicy" ORDER BY "id"`);

  const capability = createPostgresLicensingTransferPolicyCapability(connectionString);
  assert.deepEqual(await capability.findByPolicyId("policy-true"), {
    status: "FOUND",
    value: { policyId: "policy-true", transferable: true },
  });
  assert.deepEqual(await capability.findByPolicyId("policy-false"), {
    status: "FOUND",
    value: { policyId: "policy-false", transferable: false },
  });
  assert.deepEqual(await capability.findByPolicyId("missing"), { status: "NOT_FOUND" });
  assert.deepEqual(await capability.findByPolicyId(" policy-true "), { status: "NOT_FOUND" });
  assert.deepEqual(await capability.findByPolicyId("x' OR '1'='1"), {
    status: "FOUND",
    value: { policyId: "x' OR '1'='1", transferable: true },
  });
  assert.deepEqual(await capability.findByPolicyId(""), { status: "FAILED", code: "INVALID_INPUT" });

  const after = await setup.query(`SELECT "id", "productId", "name", "transferable" FROM "LicensePolicy" ORDER BY "id"`);
  assert.deepEqual(after.rows, before.rows);

  const commerceTable = await setup.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'OrderItem'
     ) AS "exists"`,
  );
  assert.equal(commerceTable.rows[0]?.exists, false);
  console.log("Licensing transfer-policy PostgreSQL GREEN: exact lookup, fail-closed defaults, SQL safety, read-only behavior, no Commerce persistence");
} finally {
  await setup.end();
}

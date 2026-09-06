import assert from "node:assert/strict";
import { Client } from "pg";
import { createPostgresCommerceOrderItemPolicyLookupCapability } from "../prisma/repositories/postgres-order-item-policy-lookup-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Commerce order-item policy PostgreSQL certification.");

const setup = new Client({ connectionString });
await setup.connect();
try {
  await setup.query(`DELETE FROM "OrderItem"`);
  await setup.query(`DELETE FROM "Order"`);
  await setup.query(
    `INSERT INTO "Order" ("id", "number", "accountId", "currency", "subtotalMinor", "taxMinor", "totalMinor", "billingSnapshot")
     VALUES ('order-a', 'ORDER-A', 'account-a', 'PHP', 1000, 0, 1000, '{}'::jsonb)`,
  );
  await setup.query(
    `INSERT INTO "OrderItem" (
       "id", "orderId", "productId", "priceId", "policyId", "productName", "priceName",
       "quantity", "unitAmountMinor", "totalMinor", "billingType", "policySnapshot"
     ) VALUES
       ('item-a', 'order-a', 'product-a', 'price-a', 'policy-a', 'Product A', 'Price A', 1, 1000, 1000, 'ONE_TIME', '{}'::jsonb),
       ('x'' OR ''1''=''1', 'order-a', 'product-a', 'price-a', 'policy-sql', 'Product A', 'Price A', 1, 1000, 1000, 'ONE_TIME', '{}'::jsonb)`,
  );
  const before = await setup.query(`SELECT "id", "orderId", "policyId" FROM "OrderItem" ORDER BY "id"`);

  const capability = createPostgresCommerceOrderItemPolicyLookupCapability(connectionString);
  assert.deepEqual(await capability.findByOrderItemId("item-a"), {
    status: "FOUND",
    value: { orderItemId: "item-a", policyId: "policy-a" },
  });
  assert.deepEqual(await capability.findByOrderItemId("missing"), { status: "NOT_FOUND" });
  assert.deepEqual(await capability.findByOrderItemId(" item-a "), { status: "NOT_FOUND" });
  assert.deepEqual(await capability.findByOrderItemId("x' OR '1'='1"), {
    status: "FOUND",
    value: { orderItemId: "x' OR '1'='1", policyId: "policy-sql" },
  });
  assert.deepEqual(await capability.findByOrderItemId(""), { status: "FAILED", code: "INVALID_INPUT" });

  const after = await setup.query(`SELECT "id", "orderId", "policyId" FROM "OrderItem" ORDER BY "id"`);
  assert.deepEqual(after.rows, before.rows);

  const licensingTable = await setup.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'LicensePolicy'
     ) AS "exists"`,
  );
  assert.equal(licensingTable.rows[0]?.exists, false);
  console.log("Commerce order-item policy PostgreSQL GREEN: exact lookup, no normalization, SQL safety, read-only behavior, no Licensing persistence");
} finally {
  await setup.end();
}

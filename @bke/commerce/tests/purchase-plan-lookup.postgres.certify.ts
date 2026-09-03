import { Client } from "pg";
import { createCommercePurchasePlanLookupCapability } from "../logic/purchase-plan-lookup";
import { createPostgresCommercePurchasePlanLookupRepository } from "../prisma/repositories/postgres-purchase-plan-lookup-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Commerce purchase-plan lookup certification.");
}

const client = new Client({ connectionString });
await client.connect();
try {
  const externalTables = await client.query<{ name: string | null }>(
    `SELECT to_regclass('public."Product"')::text AS "name"
     UNION ALL SELECT to_regclass('public."Edition"')::text
     UNION ALL SELECT to_regclass('public."LicensePolicy"')::text`,
  );
  if (externalTables.rows.some((row) => row.name !== null)) {
    throw new Error(`Commerce certification must not depend on external module tables: ${JSON.stringify(externalTables.rows)}`);
  }

  await client.query(
    `INSERT INTO "Price"
       ("id", "productId", "licensePolicyId", "name", "amountMinor", "currency",
        "billingType", "intervalUnit", "intervalCount", "active")
     VALUES
       ('legacy-annual', 'opaque-product', 'opaque-license-policy', 'Legacy annual', 10800,
        'PHP', 'SUBSCRIPTION', 'YEAR', 1, TRUE)`,
  );
  await client.query(
    `INSERT INTO "PurchasePlan"
       ("id", "editionId", "type", "currency", "amountMinor", "annualDiscountBps",
        "renewalBehavior", "active", "legacyPriceId")
     VALUES
       ('monthly-plan', 'opaque-edition', 'MONTHLY', 'PHP', 1000, NULL,
        'CUSTOMER_AUTHORIZED', TRUE, NULL)`,
  );
  await client.query(
    `INSERT INTO "PurchasePlan"
       ("id", "editionId", "type", "currency", "amountMinor", "annualDiscountBps",
        "renewalBehavior", "active", "monthlySourcePlanId", "legacyPriceId")
     VALUES
       ('annual-plan', 'opaque-edition', 'ANNUAL', 'PHP', NULL, 1000,
        'CUSTOMER_AUTHORIZED', TRUE, 'monthly-plan', 'legacy-annual')`,
  );

  const capability = createCommercePurchasePlanLookupCapability(
    createPostgresCommercePurchasePlanLookupRepository(connectionString),
  );
  const result = await capability.find({ planId: "annual-plan" });
  if (result.status !== "FOUND") {
    throw new Error(`Expected FOUND, received ${JSON.stringify(result)}`);
  }

  const expected = {
    id: "annual-plan",
    editionId: "opaque-edition",
    type: "ANNUAL",
    currency: "PHP",
    amountMinor: null,
    annualDiscountBps: 1000,
    renewalBehavior: "CUSTOMER_AUTHORIZED",
    active: true,
    monthlySource: {
      amountMinor: 1000,
      active: true,
      type: "MONTHLY",
      editionId: "opaque-edition",
    },
    legacyPriceId: "legacy-annual",
    legacyPrice: {
      id: "legacy-annual",
      productId: "opaque-product",
      licensePolicyId: "opaque-license-policy",
      name: "Legacy annual",
      amountMinor: 10800,
      currency: "PHP",
      billingType: "SUBSCRIPTION",
      intervalUnit: "YEAR",
      intervalCount: 1,
      active: true,
    },
  };
  if (JSON.stringify(result.plan) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected PurchasePlan snapshot: ${JSON.stringify(result.plan)}`);
  }

  const missing = await capability.find({ planId: "missing-plan" });
  if (missing.status !== "NOT_FOUND") {
    throw new Error(`Expected NOT_FOUND, received ${JSON.stringify(missing)}`);
  }

  console.log("Commerce PurchasePlan persistence + legacy Price compatibility GREEN");
} finally {
  await client.end();
}

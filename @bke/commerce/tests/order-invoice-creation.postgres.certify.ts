import { Client } from "pg";
import { createCommerceOrderInvoiceCreationCapability } from "../logic/order-invoice-creation";
import { createPostgresCommerceOrderInvoiceCreationRepository } from "../prisma/repositories/postgres-order-invoice-creation-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Commerce order/invoice certification.");
}

const capability = createCommerceOrderInvoiceCreationCapability(
  createPostgresCommerceOrderInvoiceCreationRepository(connectionString),
);

const input = {
  accountId: "opaque-account",
  orderNumber: "ORD-CERT-1",
  invoiceNumber: "INV-CERT-1",
  currency: "PHP",
  taxMinor: 120,
  billingSnapshot: { billingEmail: "buyer@example.com", taxId: null },
  customerSnapshot: { displayName: "Buyer" },
  lines: [
    {
      productId: "opaque-product",
      priceId: "opaque-price",
      policyId: "opaque-policy",
      productName: "Air Stack",
      priceName: "Annual",
      description: "Air Stack Annual",
      quantity: 2,
      unitAmountMinor: 1000,
      billingType: "SUBSCRIPTION" as const,
      policySnapshot: { updatePolicy: "ACTIVE_TERM" },
      editionId: "opaque-edition",
      purchasePlanId: "opaque-plan",
      planName: "Annual",
      planType: "ANNUAL" as const,
      intervalUnit: "YEAR" as const,
      intervalCount: 1,
      renewalBehavior: "CUSTOMER_AUTHORIZED" as const,
      entitlementSnapshot: { editionId: "opaque-edition" },
      pricingSnapshot: { source: "purchase-plan" },
      catalogAmountMinor: 2000,
      offerId: "opaque-offer",
      offerDiscountBps: 1000,
      offerDiscountMinor: 200,
      pricingVersion: "pricing-v1",
    },
  ],
};

const created = await capability.create(input);
if (created.status !== "CREATED") {
  throw new Error(`Expected CREATED: ${JSON.stringify(created)}`);
}
if (
  created.value.subtotalMinor !== 1800 ||
  created.value.taxMinor !== 120 ||
  created.value.totalMinor !== 1920 ||
  created.value.orderStatus !== "PENDING" ||
  created.value.invoiceStatus !== "DRAFT"
) {
  throw new Error(`Unexpected order/invoice snapshot: ${JSON.stringify(created)}`);
}

const client = new Client({ connectionString });
await client.connect();
try {
  const externalTables = await client.query<{ name: string | null }>(
    `SELECT to_regclass('public."CustomerAccount"')::text AS "name"
     UNION ALL SELECT to_regclass('public."Product"')::text
     UNION ALL SELECT to_regclass('public."Edition"')::text
     UNION ALL SELECT to_regclass('public."LicensePolicy"')::text`,
  );
  if (externalTables.rows.some((row) => row.name !== null)) {
    throw new Error(`Commerce certification must not depend on external module tables: ${JSON.stringify(externalTables.rows)}`);
  }

  const row = await client.query<{
    orderSubtotal: number;
    orderTotal: number;
    invoiceSubtotal: number;
    invoiceTotal: number;
    itemTotal: number;
    lineTotal: number;
    billingSnapshot: unknown;
    customerSnapshot: unknown;
  }>(
    `SELECT o."subtotalMinor" AS "orderSubtotal", o."totalMinor" AS "orderTotal",
            i."subtotalMinor" AS "invoiceSubtotal", i."totalMinor" AS "invoiceTotal",
            oi."totalMinor" AS "itemTotal", il."totalMinor" AS "lineTotal",
            o."billingSnapshot" AS "billingSnapshot", i."customerSnapshot" AS "customerSnapshot"
       FROM "Order" o
       JOIN "OrderItem" oi ON oi."orderId" = o."id"
       JOIN "Invoice" i ON i."orderId" = o."id"
       JOIN "InvoiceLine" il ON il."invoiceId" = i."id"
      WHERE o."number" = 'ORD-CERT-1'`,
  );
  const persisted = row.rows[0];
  if (!persisted || persisted.orderSubtotal !== 1800 || persisted.orderTotal !== 1920 || persisted.invoiceSubtotal !== 1800 || persisted.invoiceTotal !== 1920 || persisted.itemTotal !== 1800 || persisted.lineTotal !== 1800) {
    throw new Error(`Unexpected persisted totals: ${JSON.stringify(persisted)}`);
  }

  const duplicate = await capability.create({ ...input, invoiceNumber: "INV-CERT-2" });
  if (duplicate.status !== "REJECTED" || duplicate.code !== "DUPLICATE_NUMBER") {
    throw new Error(`Expected duplicate rejection: ${JSON.stringify(duplicate)}`);
  }
  const invoice2 = await client.query(`SELECT 1 FROM "Invoice" WHERE "number" = 'INV-CERT-2'`);
  if (invoice2.rowCount !== 0) {
    throw new Error("Duplicate order attempt must not leave a partial invoice.");
  }

  console.log("Commerce Order + Invoice atomic creation + immutable snapshots GREEN");
} finally {
  await client.end();
}

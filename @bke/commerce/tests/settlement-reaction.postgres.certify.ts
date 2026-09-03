import { Client } from "pg";
import { createPostgresCommerceSettlementReactionRepository } from "../prisma/repositories/postgres-settlement-reaction-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Commerce settlement certification.");
}

const settledAt = new Date("2026-09-03T12:30:00.000Z");
const repository = createPostgresCommerceSettlementReactionRepository(connectionString);
const client = new Client({ connectionString });
await client.connect();

async function seed(orderId: string, redemptionStatus: "RESERVED" | "RELEASED" = "RESERVED") {
  const invoiceId = `invoice-${orderId}`;
  const offerId = `offer-${orderId}`;
  await client.query(
    `INSERT INTO "Order"
       ("id", "number", "accountId", "status", "currency", "subtotalMinor", "taxMinor", "totalMinor", "billingSnapshot")
     VALUES ($1, $2, 'account-settlement-cert', 'PENDING', 'PHP', 800, 0, 800, '{}'::jsonb)`,
    [orderId, `NUMBER-${orderId}`],
  );
  await client.query(
    `INSERT INTO "OrderItem" (
       "id", "orderId", "productId", "priceId", "policyId", "productName", "priceName",
       "quantity", "unitAmountMinor", "totalMinor", "billingType", "policySnapshot",
       "editionId", "entitlementSnapshot"
     ) VALUES (
       $1, $2, 'product-settlement-cert', 'price-settlement-cert', 'policy-settlement-cert',
       'Air Stack', 'Standard', 1, 800, 800, 'ONE_TIME', '{}'::jsonb,
       'edition-settlement-cert', '{}'::jsonb
     )`,
    [`item-${orderId}`, orderId],
  );
  await client.query(
    `INSERT INTO "Invoice"
       ("id", "number", "orderId", "status", "customerSnapshot", "currency", "subtotalMinor", "taxMinor", "totalMinor")
     VALUES ($1, $2, $3, 'DRAFT', '{}'::jsonb, 'PHP', 800, 0, 800)`,
    [invoiceId, `INV-${orderId}`, orderId],
  );
  await client.query(
    `INSERT INTO "DiscountOffer" (
       "id", "name", "type", "status", "discountBps", "startsAt", "createdById", "createdAt", "updatedAt"
     ) VALUES ($1, $2, 'CUSTOMER_ACCOUNT_OFFER', 'ACTIVE', 2000, $3, 'settlement-cert', $3, $3)`,
    [offerId, `Offer ${orderId}`, new Date(settledAt.getTime() - 60_000)],
  );
  await client.query(
    `INSERT INTO "OfferRedemption" (
       "id", "offerId", "accountId", "orderId", "status", "discountBps", "baseMinor",
       "discountMinor", "finalMinor", "currency", "pricingVersion", "reservedAt", "releasedAt"
     ) VALUES (
       $1, $2, 'account-settlement-cert', $3, $4::"CommerceOfferRedemptionStatus", 2000,
       1000, 200, 800, 'PHP', 'pricing-v1', $5, $6
     )`,
    [
      `redemption-${orderId}`,
      offerId,
      orderId,
      redemptionStatus,
      new Date(settledAt.getTime() - 30_000),
      redemptionStatus === "RELEASED" ? new Date(settledAt.getTime() - 10_000) : null,
    ],
  );
  return { invoiceId };
}

try {
  await seed("settlement-offer-applied");
  const settled = await repository.settle({
    orderId: "settlement-offer-applied",
    expectedAmountMinor: 800,
    expectedCurrency: "PHP",
    settledAt,
  });
  if (
    settled.status !== "SETTLED" ||
    settled.value.orderStatus !== "PAID" ||
    settled.value.invoiceStatus !== "FINAL" ||
    settled.value.items.length !== 1
  ) {
    throw new Error(`Commerce paid settlement failed: ${JSON.stringify(settled)}`);
  }

  const state = await client.query<{
    orderStatus: string;
    paidAt: Date | null;
    invoiceStatus: string;
    issuedAt: Date | null;
    redemptionStatus: string;
    appliedAt: Date | null;
  }>(
    `SELECT o."status"::text AS "orderStatus", o."paidAt",
            i."status"::text AS "invoiceStatus", i."issuedAt",
            r."status"::text AS "redemptionStatus", r."appliedAt"
       FROM "Order" o
       JOIN "Invoice" i ON i."orderId" = o."id"
       JOIN "OfferRedemption" r ON r."orderId" = o."id"
      WHERE o."id" = 'settlement-offer-applied'`,
  );
  const row = state.rows[0];
  if (
    !row ||
    row.orderStatus !== "PAID" ||
    row.paidAt?.getTime() !== settledAt.getTime() ||
    row.invoiceStatus !== "FINAL" ||
    row.issuedAt?.getTime() !== settledAt.getTime() ||
    row.redemptionStatus !== "APPLIED" ||
    row.appliedAt?.getTime() !== settledAt.getTime()
  ) {
    throw new Error(`Paid settlement persistence drifted: ${JSON.stringify(row)}`);
  }

  const retry = await repository.settle({
    orderId: "settlement-offer-applied",
    expectedAmountMinor: 800,
    expectedCurrency: "PHP",
    settledAt: new Date(settledAt.getTime() + 1_000),
  });
  if (retry.status !== "SETTLED") {
    throw new Error(`Paid settlement retry was not idempotent: ${JSON.stringify(retry)}`);
  }
  const retryApplied = await client.query<{ appliedAt: Date | null }>(
    `SELECT "appliedAt" FROM "OfferRedemption" WHERE "orderId" = 'settlement-offer-applied'`,
  );
  if (retryApplied.rows[0]?.appliedAt?.getTime() !== settledAt.getTime()) {
    throw new Error("Settlement retry changed the original offer application timestamp.");
  }

  await seed("settlement-offer-released", "RELEASED");
  const released = await repository.settle({
    orderId: "settlement-offer-released",
    expectedAmountMinor: 800,
    expectedCurrency: "PHP",
    settledAt,
  });
  if (released.status !== "REJECTED" || released.code !== "ORDER_NOT_SETTLEABLE") {
    throw new Error(`Released offer redemption did not fail closed: ${JSON.stringify(released)}`);
  }
  const releasedOrder = await client.query<{ status: string }>(
    `SELECT "status"::text AS "status" FROM "Order" WHERE "id" = 'settlement-offer-released'`,
  );
  if (releasedOrder.rows[0]?.status !== "PENDING") {
    throw new Error("Rejected settlement mutated the order.");
  }

  console.log("Commerce settlement PostgreSQL certification GREEN");
} finally {
  await client.end();
}

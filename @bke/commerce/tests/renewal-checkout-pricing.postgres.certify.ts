import assert from "node:assert/strict";
import { Client } from "pg";
import { createCommerceRenewalCheckoutPricingCapability } from "../logic/renewal-checkout-pricing";
import { createPostgresCommerceRenewalCheckoutPricingRepository } from "../prisma/repositories/postgres-renewal-checkout-pricing-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Commerce renewal checkout pricing certification.");

const capability = createCommerceRenewalCheckoutPricingCapability(
  createPostgresCommerceRenewalCheckoutPricingRepository(connectionString),
);
const client = new Client({ connectionString });
await client.connect();

async function seedSubscription(input: {
  id: string;
  accountId: string;
  planId: string;
  normalMinor: number;
  discountBps: number | null;
  cyclesTotal: number | null;
  cyclesConsumed: number;
  offerId: string | null;
}) {
  const now = new Date();
  await client.query(
    `INSERT INTO "Subscription" (
       "id", "accountId", "orderId", "productId", "purchasePlanId", "status", "seats",
       "currentPeriodStart", "currentPeriodEnd", "renewalReminderAt", "currency",
       "normalRecurringAmountMinor", "discountedRecurringAmountMinor", "promotionalDiscountBps",
       "discountedCyclesTotal", "discountedCyclesConsumed", "offerId", "offerSnapshot", "pricingVersion",
       "createdAt", "updatedAt"
     ) VALUES ($1,$2,$3,'product-renewal',$4,'ACTIVE',1,$5,$6,$7,'PHP',$8,$9,$10,$11,$12,$13,$14::jsonb,'pricing-v1',$5,$5)`,
    [
      input.id,
      input.accountId,
      `source-${input.id}`,
      input.planId,
      now,
      new Date(now.getTime() + 30 * 86400000),
      new Date(now.getTime() + 23 * 86400000),
      input.normalMinor,
      input.discountBps === null ? null : Math.round(input.normalMinor * (10000 - input.discountBps) / 10000),
      input.discountBps,
      input.cyclesTotal,
      input.cyclesConsumed,
      input.offerId,
      JSON.stringify(input.offerId ? { name: "Launch loyalty", code: "LOYAL" } : null),
    ],
  );
}

async function seedOrder(input: {
  id: string;
  accountId: string;
  planId: string;
  renewalSubscriptionId: string | null;
  initialMinor: number;
}) {
  await client.query(
    `INSERT INTO "Order" ("id","number","accountId","renewalSubscriptionId","status","currency","subtotalMinor","taxMinor","totalMinor","billingSnapshot")
     VALUES ($1,$2,$3,$4,'PENDING','PHP',$5,0,$5,'{}'::jsonb)`,
    [input.id, `ORD-${input.id}`, input.accountId, input.renewalSubscriptionId, input.initialMinor],
  );
  await client.query(
    `INSERT INTO "OrderItem" (
       "id","orderId","productId","priceId","policyId","productName","priceName","quantity",
       "unitAmountMinor","totalMinor","billingType","policySnapshot","purchasePlanId","planName","planType",
       "intervalUnit","intervalCount","renewalBehavior","pricingSnapshot","catalogAmountMinor","pricingVersion"
     ) VALUES ($1,$2,'product-renewal',$3,'policy','Product','Monthly',1,$4,$4,'SUBSCRIPTION','{}'::jsonb,$3,'Monthly','MONTHLY','MONTH',1,'CUSTOMER_AUTHORIZED',$5::jsonb,$4,'pricing-v1')`,
    [`ITEM-${input.id}`, input.id, input.planId, input.initialMinor, JSON.stringify({ catalogAmountMinor: input.initialMinor, finalAmountMinor: input.initialMinor })],
  );
  await client.query(
    `INSERT INTO "Invoice" ("id","number","orderId","status","customerSnapshot","currency","subtotalMinor","taxMinor","totalMinor")
     VALUES ($1,$2,$3,'DRAFT','{}'::jsonb,'PHP',$4,0,$4)`,
    [`INV-${input.id}`, `INVNO-${input.id}`, input.id, input.initialMinor],
  );
  await client.query(
    `INSERT INTO "InvoiceLine" ("id","invoiceId","description","quantity","unitAmountMinor","totalMinor")
     VALUES ($1,$2,'Product — Monthly',1,$3,$3)`,
    [`LINE-${input.id}`, `INV-${input.id}`, input.initialMinor],
  );
}

try {
  await client.query('TRUNCATE TABLE "InvoiceLine", "Invoice", "OrderItem", "Order", "Subscription" CASCADE');

  await seedSubscription({
    id: "subscription-scheduled",
    accountId: "account-renewal",
    planId: "plan-monthly",
    normalMinor: 1000,
    discountBps: 2500,
    cyclesTotal: 3,
    cyclesConsumed: 1,
    offerId: "offer-carried",
  });
  await seedOrder({
    id: "order-scheduled",
    accountId: "account-renewal",
    planId: "plan-monthly",
    renewalSubscriptionId: "subscription-scheduled",
    initialMinor: 1500,
  });

  const scheduled = await capability.prepare({ orderId: "order-scheduled" });
  assert.deepEqual(scheduled, {
    status: "READY",
    renewal: true,
    subtotalMinor: 750,
    totalMinor: 750,
    scheduledOfferApplied: true,
  });
  const scheduledRow = await client.query<{
    orderSubtotal: number;
    orderTotal: number;
    catalogMinor: number;
    itemTotal: number;
    offerId: string | null;
    invoiceSubtotal: number;
    invoiceTotal: number;
    lineSum: string;
  }>(
    `SELECT o."subtotalMinor" AS "orderSubtotal", o."totalMinor" AS "orderTotal",
            oi."catalogAmountMinor" AS "catalogMinor", oi."totalMinor" AS "itemTotal", oi."offerId" AS "offerId",
            i."subtotalMinor" AS "invoiceSubtotal", i."totalMinor" AS "invoiceTotal",
            SUM(il."totalMinor")::text AS "lineSum"
       FROM "Order" o
       JOIN "OrderItem" oi ON oi."orderId"=o."id"
       JOIN "Invoice" i ON i."orderId"=o."id"
       JOIN "InvoiceLine" il ON il."invoiceId"=i."id"
      WHERE o."id"='order-scheduled'
      GROUP BY o."subtotalMinor",o."totalMinor",oi."catalogAmountMinor",oi."totalMinor",oi."offerId",i."subtotalMinor",i."totalMinor'`,
  );
  const carried = scheduledRow.rows[0]!;
  assert.equal(carried.orderSubtotal, 750);
  assert.equal(carried.orderTotal, 750);
  assert.equal(carried.catalogMinor, 1000);
  assert.equal(carried.itemTotal, 750);
  assert.equal(carried.offerId, "offer-carried");
  assert.equal(carried.invoiceSubtotal, 1000);
  assert.equal(carried.invoiceTotal, 750);
  assert.equal(Number(carried.lineSum), 750);

  await seedSubscription({
    id: "subscription-exhausted",
    accountId: "account-renewal",
    planId: "plan-monthly",
    normalMinor: 1000,
    discountBps: 2500,
    cyclesTotal: 3,
    cyclesConsumed: 3,
    offerId: "offer-carried",
  });
  await seedOrder({
    id: "order-exhausted",
    accountId: "account-renewal",
    planId: "plan-monthly",
    renewalSubscriptionId: "subscription-exhausted",
    initialMinor: 1500,
  });
  const exhausted = await capability.prepare({ orderId: "order-exhausted" });
  assert.deepEqual(exhausted, {
    status: "READY",
    renewal: true,
    subtotalMinor: 1000,
    totalMinor: 1000,
    scheduledOfferApplied: false,
  });
  const exhaustedItem = await client.query<{ catalogMinor: number; itemTotal: number; offerId: string | null }>(
    `SELECT "catalogAmountMinor" AS "catalogMinor", "totalMinor" AS "itemTotal", "offerId" AS "offerId"
       FROM "OrderItem" WHERE "orderId"='order-exhausted'`,
  );
  assert.equal(exhaustedItem.rows[0]?.catalogMinor, 1000);
  assert.equal(exhaustedItem.rows[0]?.itemTotal, 1000);
  assert.equal(exhaustedItem.rows[0]?.offerId, null);

  await seedOrder({
    id: "order-normal",
    accountId: "account-renewal",
    planId: "plan-monthly",
    renewalSubscriptionId: null,
    initialMinor: 1500,
  });
  assert.deepEqual(await capability.prepare({ orderId: "order-normal" }), { status: "READY", renewal: false });

  console.log("Commerce renewal checkout recurring-price + scheduled-cycle carry GREEN");
} finally {
  await client.end();
}

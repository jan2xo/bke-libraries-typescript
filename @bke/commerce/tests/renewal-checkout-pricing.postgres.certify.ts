import assert from "node:assert/strict";
import { Client } from "pg";
import { createCommerceRenewalCheckoutPricingCapability } from "../logic/renewal-checkout-pricing";
import { createPostgresCommerceRenewalCheckoutPricingRepository } from "../prisma/repositories/postgres-renewal-checkout-pricing-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required.");
const client = new Client({ connectionString });
await client.connect();
const capability = createCommerceRenewalCheckoutPricingCapability(
  createPostgresCommerceRenewalCheckoutPricingRepository(connectionString),
);

async function seed(subscriptionId: string, orderId: string, consumed: number) {
  const now = new Date();
  await client.query(
    `INSERT INTO "Subscription" (
       "id","accountId","orderId","productId","purchasePlanId","status","seats","currentPeriodStart","currentPeriodEnd",
       "renewalReminderAt","currency","normalRecurringAmountMinor","discountedRecurringAmountMinor","promotionalDiscountBps",
       "discountedCyclesTotal","discountedCyclesConsumed","offerId","offerSnapshot","pricingVersion","createdAt","updatedAt"
     ) VALUES ($1,'acct', $2,'product','plan','ACTIVE',1,$3,$4,$5,'PHP',1000,750,2500,3,$6,'offer-carried',$7::jsonb,'pricing-v1',$3,$3)`,
    [subscriptionId, `source-${subscriptionId}`, now, new Date(now.getTime()+30*86400000), new Date(now.getTime()+23*86400000), consumed, JSON.stringify({name:"Launch loyalty",code:"LOYAL"})],
  );
  await client.query(
    `INSERT INTO "Order" ("id","number","accountId","renewalSubscriptionId","status","currency","subtotalMinor","taxMinor","totalMinor","billingSnapshot")
     VALUES ($1,$2,'acct',$3,'PENDING','PHP',1500,0,1500,'{}'::jsonb)`,
    [orderId, `ORD-${orderId}`, subscriptionId],
  );
  await client.query(
    `INSERT INTO "OrderItem" (
       "id","orderId","productId","priceId","policyId","productName","priceName","quantity","unitAmountMinor","totalMinor",
       "billingType","policySnapshot","purchasePlanId","planName","planType","intervalUnit","intervalCount","renewalBehavior",
       "pricingSnapshot","catalogAmountMinor","pricingVersion"
     ) VALUES ($1,$2,'product','plan','policy','Product','Monthly',1,1500,1500,'SUBSCRIPTION','{}'::jsonb,'plan','Monthly','MONTHLY','MONTH',1,'CUSTOMER_AUTHORIZED',$3::jsonb,1500,'pricing-v1')`,
    [`ITEM-${orderId}`, orderId, JSON.stringify({catalogAmountMinor:1500,finalAmountMinor:1500})],
  );
  await client.query(
    `INSERT INTO "Invoice" ("id","number","orderId","status","customerSnapshot","currency","subtotalMinor","taxMinor","totalMinor")
     VALUES ($1,$2,$3,'DRAFT','{}'::jsonb,'PHP',1500,0,1500)`,
    [`INV-${orderId}`, `INVNO-${orderId}`, orderId],
  );
  await client.query(
    `INSERT INTO "InvoiceLine" ("id","invoiceId","description","quantity","unitAmountMinor","totalMinor")
     VALUES ($1,$2,'Product — Monthly',1,1500,1500)`,
    [`LINE-${orderId}`, `INV-${orderId}`],
  );
}

try {
  await client.query('TRUNCATE TABLE "InvoiceLine", "Invoice", "OrderItem", "Order", "Subscription" CASCADE');

  await seed("sub-scheduled","order-scheduled",1);
  assert.deepEqual(await capability.prepare({orderId:"order-scheduled"}), {
    status:"READY", renewal:true, subtotalMinor:750, totalMinor:750, scheduledOfferApplied:true,
  });
  const scheduled = await client.query<{
    catalog:number; itemTotal:number; offerId:string|null; invoiceSubtotal:number; invoiceTotal:number; lineSum:string;
  }>(
    `SELECT oi."catalogAmountMinor" AS catalog, oi."totalMinor" AS "itemTotal", oi."offerId" AS "offerId",
            i."subtotalMinor" AS "invoiceSubtotal", i."totalMinor" AS "invoiceTotal",
            (SELECT SUM("totalMinor")::text FROM "InvoiceLine" WHERE "invoiceId"=i."id") AS "lineSum"
       FROM "OrderItem" oi JOIN "Invoice" i ON i."orderId"=oi."orderId"
      WHERE oi."orderId"='order-scheduled'`,
  );
  assert.equal(scheduled.rows[0]?.catalog,1000);
  assert.equal(scheduled.rows[0]?.itemTotal,750);
  assert.equal(scheduled.rows[0]?.offerId,"offer-carried");
  assert.equal(scheduled.rows[0]?.invoiceSubtotal,1000);
  assert.equal(scheduled.rows[0]?.invoiceTotal,750);
  assert.equal(Number(scheduled.rows[0]?.lineSum),750);

  await seed("sub-exhausted","order-exhausted",3);
  assert.deepEqual(await capability.prepare({orderId:"order-exhausted"}), {
    status:"READY", renewal:true, subtotalMinor:1000, totalMinor:1000, scheduledOfferApplied:false,
  });
  const exhausted = await client.query<{catalog:number;itemTotal:number;offerId:string|null}>(
    `SELECT "catalogAmountMinor" AS catalog,"totalMinor" AS "itemTotal","offerId" AS "offerId" FROM "OrderItem" WHERE "orderId"='order-exhausted'`,
  );
  assert.equal(exhausted.rows[0]?.catalog,1000);
  assert.equal(exhausted.rows[0]?.itemTotal,1000);
  assert.equal(exhausted.rows[0]?.offerId,null);

  await client.query(
    `INSERT INTO "Order" ("id","number","accountId","status","currency","subtotalMinor","taxMinor","totalMinor","billingSnapshot")
     VALUES ('order-normal','ORD-normal','acct','PENDING','PHP',1500,0,1500,'{}'::jsonb)`,
  );
  assert.deepEqual(await capability.prepare({orderId:"order-normal"}), {status:"READY",renewal:false});
  console.log("Commerce renewal checkout pricing GREEN");
} finally {
  await client.end();
}

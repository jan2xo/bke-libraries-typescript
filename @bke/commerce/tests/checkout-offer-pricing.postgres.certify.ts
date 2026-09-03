import { Client } from "pg";
import { createCommerceCheckoutOfferPricingCapability } from "../logic/checkout-offer-pricing";
import { createPostgresCommerceCheckoutOfferPricingRepository } from "../prisma/repositories/postgres-checkout-offer-pricing-repository";
import { createPostgresCommerceZeroPaymentFulfillmentRepository } from "../prisma/repositories/postgres-zero-payment-fulfillment-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Commerce checkout-offer pricing certification.");
}

const now = new Date("2026-09-03T12:00:00.000Z");
const pricing = createCommerceCheckoutOfferPricingCapability(
  createPostgresCommerceCheckoutOfferPricingRepository(connectionString),
  () => now,
);
const zeroFulfillment = createPostgresCommerceZeroPaymentFulfillmentRepository(connectionString);
const client = new Client({ connectionString });
await client.connect();

async function seedOrder(input: {
  id: string;
  baseMinor?: number;
  planType?: "PERPETUAL" | "MONTHLY" | "ANNUAL";
  productId?: string;
  editionId?: string;
  purchasePlanId?: string;
  accountId?: string;
}) {
  const baseMinor = input.baseMinor ?? 1000;
  const planType = input.planType ?? "MONTHLY";
  const productId = input.productId ?? "product-offer-cert";
  const editionId = input.editionId ?? "edition-offer-cert";
  const purchasePlanId = input.purchasePlanId ?? "plan-offer-cert";
  const accountId = input.accountId ?? "account-offer-cert";
  const invoiceId = `invoice-${input.id}`;
  const itemId = `item-${input.id}`;

  await client.query(
    `INSERT INTO "Order"
       ("id", "number", "accountId", "status", "currency", "subtotalMinor", "taxMinor", "totalMinor", "billingSnapshot")
     VALUES ($1, $2, $3, 'PENDING', 'PHP', $4, 0, $4, '{}'::jsonb)`,
    [input.id, `NUMBER-${input.id}`, accountId, baseMinor],
  );
  await client.query(
    `INSERT INTO "OrderItem" (
       "id", "orderId", "productId", "priceId", "policyId", "productName", "priceName",
       "quantity", "unitAmountMinor", "totalMinor", "billingType", "policySnapshot",
       "editionId", "purchasePlanId", "planName", "planType", "entitlementSnapshot",
       "pricingSnapshot", "catalogAmountMinor", "pricingVersion"
     ) VALUES (
       $1, $2, $3, $4, $5, 'Air Stack', 'Standard', 1, $6, $6,
       $7::"CommerceBillingType", '{}'::jsonb, $8, $9, 'Standard', $10::"CommercePurchasePlanType",
       '{}'::jsonb, $11::jsonb, $6, 'pricing-v1'
     )`,
    [
      itemId,
      input.id,
      productId,
      `price-${input.id}`,
      `policy-${input.id}`,
      baseMinor,
      planType === "PERPETUAL" ? "ONE_TIME" : "SUBSCRIPTION",
      editionId,
      purchasePlanId,
      planType,
      JSON.stringify({ pricingVersion: "pricing-v1", catalogAmountMinor: baseMinor, finalAmountMinor: baseMinor }),
    ],
  );
  await client.query(
    `INSERT INTO "Invoice"
       ("id", "number", "orderId", "status", "customerSnapshot", "currency", "subtotalMinor", "taxMinor", "totalMinor")
     VALUES ($1, $2, $3, 'DRAFT', '{}'::jsonb, 'PHP', $4, 0, $4)`,
    [invoiceId, `INV-${input.id}`, input.id, baseMinor],
  );
  await client.query(
    `INSERT INTO "InvoiceLine"
       ("id", "invoiceId", "description", "quantity", "unitAmountMinor", "totalMinor")
     VALUES ($1, $2, 'Air Stack Standard', 1, $3, $3)`,
    [`line-${input.id}`, invoiceId, baseMinor],
  );

  return { invoiceId, itemId, productId, editionId, purchasePlanId, accountId };
}

async function seedOffer(input: {
  id: string;
  code?: string | null;
  discountBps: number;
  type?: "GENERAL_PROMOTION" | "CUSTOMER_ACCOUNT_OFFER" | "ADMINISTRATIVE_ADJUSTMENT";
  productId?: string | null;
  editionId?: string | null;
  purchasePlanId?: string | null;
  customerAccountId?: string | null;
  allowZeroTotal?: boolean;
  createdAt?: Date;
}) {
  await client.query(
    `INSERT INTO "DiscountOffer" (
       "id", "codeNormalized", "name", "type", "status", "discountBps", "startsAt", "endsAt",
       "productId", "editionId", "purchasePlanId", "customerAccountId", "allowZeroTotal",
       "createdById", "createdAt", "updatedAt"
     ) VALUES (
       $1, $2, $3, $4::"CommerceDiscountType", 'ACTIVE', $5, $6, NULL,
       $7, $8, $9, $10, $11, 'checkout-offer-cert', $12, $12
     )`,
    [
      input.id,
      input.code ?? null,
      `Offer ${input.id}`,
      input.type ?? "GENERAL_PROMOTION",
      input.discountBps,
      new Date(now.getTime() - 60_000),
      input.productId ?? null,
      input.editionId ?? null,
      input.purchasePlanId ?? null,
      input.customerAccountId ?? null,
      input.allowZeroTotal ?? false,
      input.createdAt ?? new Date(now.getTime() - 120_000),
    ],
  );
}

try {
  const explicitCodeOrder = await seedOrder({ id: "checkout-offer-explicit-code" });
  await seedOffer({ id: "offer-explicit-code", code: "LAUNCH25", discountBps: 2500 });
  const explicitCode = await pricing.price({
    orderId: "checkout-offer-explicit-code",
    offerIdentifier: " launch25 ",
  });
  if (
    explicitCode.status !== "PRICED" ||
    explicitCode.value.totalMinor !== 750 ||
    explicitCode.value.offer?.offerId !== "offer-explicit-code" ||
    explicitCode.value.offer.discountMinor !== 250
  ) {
    throw new Error(`Explicit-code pricing failed: ${JSON.stringify(explicitCode)}`);
  }
  const explicitState = await client.query<{
    orderTotal: number;
    itemTotal: number;
    offerId: string | null;
    offerDiscountMinor: number | null;
    invoiceTotal: number;
    invoiceLines: string;
    redemptionStatus: string;
    pricingSnapshot: Record<string, unknown>;
  }>(
    `SELECT o."totalMinor" AS "orderTotal", i."totalMinor" AS "itemTotal", i."offerId",
            i."offerDiscountMinor", v."totalMinor" AS "invoiceTotal",
            (SELECT COUNT(*)::text FROM "InvoiceLine" l WHERE l."invoiceId" = v."id") AS "invoiceLines",
            r."status"::text AS "redemptionStatus", i."pricingSnapshot"
       FROM "Order" o
       JOIN "OrderItem" i ON i."orderId" = o."id"
       JOIN "Invoice" v ON v."orderId" = o."id"
       JOIN "OfferRedemption" r ON r."orderId" = o."id"
      WHERE o."id" = 'checkout-offer-explicit-code'`,
  );
  const explicitRow = explicitState.rows[0];
  if (
    !explicitRow ||
    Number(explicitRow.orderTotal) !== 750 ||
    Number(explicitRow.itemTotal) !== 750 ||
    explicitRow.offerId !== "offer-explicit-code" ||
    Number(explicitRow.offerDiscountMinor) !== 250 ||
    Number(explicitRow.invoiceTotal) !== 750 ||
    explicitRow.invoiceLines !== "2" ||
    explicitRow.redemptionStatus !== "RESERVED" ||
    (explicitRow.pricingSnapshot.offer as { id?: string } | undefined)?.id !== "offer-explicit-code"
  ) {
    throw new Error(`Explicit-code persistence drifted: ${JSON.stringify(explicitRow)}`);
  }

  await seedOrder({ id: "checkout-offer-explicit-id" });
  await seedOffer({ id: "offer-explicit-id", code: "BY-ID", discountBps: 1000 });
  const explicitId = await pricing.price({
    orderId: "checkout-offer-explicit-id",
    offerIdentifier: "offer-explicit-id",
  });
  if (explicitId.status !== "PRICED" || explicitId.value.totalMinor !== 900) {
    throw new Error(`Explicit-ID pricing failed: ${JSON.stringify(explicitId)}`);
  }

  const publicOrder = await seedOrder({
    id: "checkout-offer-public",
    productId: "product-public-offer-cert",
  });
  await seedOffer({
    id: "offer-public-low",
    code: null,
    discountBps: 1000,
    productId: publicOrder.productId,
    createdAt: new Date(now.getTime() - 180_000),
  });
  await seedOffer({
    id: "offer-public-high",
    code: null,
    discountBps: 3000,
    productId: publicOrder.productId,
    createdAt: new Date(now.getTime() - 60_000),
  });
  const publicResult = await pricing.price({ orderId: "checkout-offer-public" });
  if (
    publicResult.status !== "PRICED" ||
    publicResult.value.totalMinor !== 700 ||
    publicResult.value.offer?.offerId !== "offer-public-high"
  ) {
    throw new Error(`Best public promotion was not selected: ${JSON.stringify(publicResult)}`);
  }

  const prohibitedOrder = await seedOrder({
    id: "checkout-offer-free-public-perpetual",
    planType: "PERPETUAL",
    productId: "product-free-public-perpetual",
  });
  await seedOffer({
    id: "offer-free-public-perpetual",
    code: null,
    discountBps: 10_000,
    productId: prohibitedOrder.productId,
    allowZeroTotal: true,
  });
  const prohibited = await pricing.price({ orderId: "checkout-offer-free-public-perpetual" });
  if (prohibited.status !== "REJECTED" || prohibited.code !== "ZERO_TOTAL_NOT_ALLOWED") {
    throw new Error(`Free perpetual public promotion was not rejected: ${JSON.stringify(prohibited)}`);
  }

  const freeOrder = await seedOrder({
    id: "checkout-offer-free-account",
    planType: "MONTHLY",
    accountId: "account-free-offer-cert",
  });
  await seedOffer({
    id: "offer-free-account",
    code: "FREE100",
    discountBps: 10_000,
    type: "CUSTOMER_ACCOUNT_OFFER",
    customerAccountId: freeOrder.accountId,
    allowZeroTotal: true,
  });
  const free = await pricing.price({
    orderId: "checkout-offer-free-account",
    offerIdentifier: "FREE100",
  });
  if (free.status !== "PRICED" || free.value.totalMinor !== 0 || !free.value.offer) {
    throw new Error(`Authorized zero-total offer failed: ${JSON.stringify(free)}`);
  }
  const fulfilled = await zeroFulfillment.fulfill({
    orderId: "checkout-offer-free-account",
    fulfilledAt: now,
  });
  if (fulfilled.status !== "FULFILLED") {
    throw new Error(`Zero-payment fulfillment failed: ${JSON.stringify(fulfilled)}`);
  }
  const applied = await client.query<{ status: string; appliedAt: Date | null }>(
    `SELECT "status"::text AS "status", "appliedAt"
       FROM "OfferRedemption"
      WHERE "orderId" = 'checkout-offer-free-account'`,
  );
  if (
    applied.rows[0]?.status !== "APPLIED" ||
    applied.rows[0]?.appliedAt?.getTime() !== now.getTime()
  ) {
    throw new Error(`Zero-payment offer redemption was not applied: ${JSON.stringify(applied.rows[0])}`);
  }
  const retry = await zeroFulfillment.fulfill({
    orderId: "checkout-offer-free-account",
    fulfilledAt: new Date(now.getTime() + 1_000),
  });
  if (retry.status !== "FULFILLED") {
    throw new Error(`Zero-payment offer retry was not idempotent: ${JSON.stringify(retry)}`);
  }

  console.log("Commerce checkout offer pricing PostgreSQL certification GREEN");
} finally {
  await client.end();
}

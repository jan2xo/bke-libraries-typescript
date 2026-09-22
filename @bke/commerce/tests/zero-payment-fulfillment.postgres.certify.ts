import { Client } from "pg";
import { createCommerceOrderInvoiceCreationCapability } from "../logic/order-invoice-creation";
import { createCommerceZeroPaymentFulfillmentCapability } from "../logic/zero-payment-fulfillment";
import { createPostgresCommerceOrderInvoiceCreationRepository } from "../prisma/repositories/postgres-order-invoice-creation-repository";
import { createPostgresCommerceZeroPaymentFulfillmentRepository } from "../prisma/repositories/postgres-zero-payment-fulfillment-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Commerce zero-payment certification.");
}

const orders = createCommerceOrderInvoiceCreationCapability(
  createPostgresCommerceOrderInvoiceCreationRepository(connectionString),
);
let grantCalls = 0;
let claimCalls = 0;
const fulfillment = createCommerceZeroPaymentFulfillmentCapability({
  repository: createPostgresCommerceZeroPaymentFulfillmentRepository(connectionString),
  entitlements: {
    async grant() {
      grantCalls += 1;
      return { status: grantCalls === 1 ? ("GRANTED" as const) : ("EXISTING" as const) };
    },
  },
  claimUnits: {
    async issue(input) {
      claimCalls += 1;
      if (input.purchaserAccountId !== "opaque-account" || input.purchasePlanId !== "opaque-plan") {
        throw new Error(`Unexpected zero-payment claim input: ${JSON.stringify(input)}`);
      }
      return { status: claimCalls === 1 ? ("ISSUED" as const) : ("EXISTING" as const), unitCount: input.quantity };
    },
  },
});

function orderInput(
  number: string,
  invoiceNumber: string,
  amountMinor: number,
  fulfillmentMode: "ACCOUNT_ENTITLEMENT" | "CLAIM_CODE" = "ACCOUNT_ENTITLEMENT",
) {
  return {
    accountId: "opaque-account",
    fulfillmentMode,
    orderNumber: number,
    invoiceNumber,
    currency: "PHP",
    taxMinor: 0,
    billingSnapshot: { email: "buyer@example.test" },
    customerSnapshot: { name: "Buyer" },
    lines: [
      {
        productId: "opaque-product",
        priceId: "opaque-price",
        policyId: "opaque-policy",
        productName: "Air Stack",
        priceName: "Complimentary",
        description: "Air Stack complimentary entitlement",
        quantity: 1,
        unitAmountMinor: amountMinor,
        billingType: "ONE_TIME" as const,
        policySnapshot: { maxDevices: 1 },
        editionId: "opaque-edition",
        purchasePlanId: "opaque-plan",
        entitlementSnapshot: { tier: "PRO" },
      },
    ],
  };
}

const zero = await orders.create(orderInput("ORD-ZERO-CERT-1", "INV-ZERO-CERT-1", 0));
if (zero.status !== "CREATED" || zero.value.totalMinor !== 0) {
  throw new Error(`Expected zero-total order: ${JSON.stringify(zero)}`);
}

const fulfilledAt = new Date("2026-09-03T00:00:00Z");
const first = await fulfillment.fulfill({ orderId: zero.value.orderId, fulfilledAt });
if (
  first.status !== "FULFILLED" ||
  first.value.orderStatus !== "PAID" ||
  first.value.invoiceStatus !== "FINAL" ||
  first.value.fulfillmentMode !== "ACCOUNT_ENTITLEMENT" ||
  first.value.entitlementCount !== 1 ||
  first.value.claimUnitCount !== 0
) {
  throw new Error(`Expected fulfilled zero-total direct order: ${JSON.stringify(first)}`);
}

const retry = await fulfillment.fulfill({ orderId: zero.value.orderId, fulfilledAt });
if (
  retry.status !== "FULFILLED" ||
  retry.value.entitlementCount !== 1 ||
  retry.value.claimUnitCount !== 0 ||
  grantCalls !== 2 ||
  claimCalls !== 0
) {
  throw new Error(`Expected idempotent direct fulfillment retry: ${JSON.stringify(retry)} grants=${grantCalls}`);
}

const claimZero = await orders.create(
  orderInput("ORD-ZERO-CLAIM-CERT", "INV-ZERO-CLAIM-CERT", 0, "CLAIM_CODE"),
);
if (claimZero.status !== "CREATED" || claimZero.value.totalMinor !== 0) {
  throw new Error(`Expected zero-total claim order: ${JSON.stringify(claimZero)}`);
}
const claimFirst = await fulfillment.fulfill({ orderId: claimZero.value.orderId, fulfilledAt });
if (
  claimFirst.status !== "FULFILLED" ||
  claimFirst.value.fulfillmentMode !== "CLAIM_CODE" ||
  claimFirst.value.entitlementCount !== 0 ||
  claimFirst.value.claimUnitCount !== 1 ||
  grantCalls !== 2 ||
  claimCalls !== 1
) {
  throw new Error(`Expected claim-routed zero-total fulfillment: ${JSON.stringify(claimFirst)}`);
}
const claimRetry = await fulfillment.fulfill({ orderId: claimZero.value.orderId, fulfilledAt });
if (
  claimRetry.status !== "FULFILLED" ||
  claimRetry.value.claimUnitCount !== 1 ||
  grantCalls !== 2 ||
  claimCalls !== 2
) {
  throw new Error(`Expected idempotent claim fulfillment retry: ${JSON.stringify(claimRetry)} claims=${claimCalls}`);
}

const nonzero = await orders.create(orderInput("ORD-ZERO-CERT-2", "INV-ZERO-CERT-2", 100));
if (nonzero.status !== "CREATED") throw new Error(`Expected non-zero order: ${JSON.stringify(nonzero)}`);
const rejected = await fulfillment.fulfill({ orderId: nonzero.value.orderId, fulfilledAt });
if (rejected.status !== "REJECTED" || rejected.code !== "ORDER_NOT_ZERO_TOTAL") {
  throw new Error(`Expected non-zero rejection: ${JSON.stringify(rejected)}`);
}

const client = new Client({ connectionString });
await client.connect();
try {
  const rows = await client.query<{
    number: string;
    fulfillmentMode: string;
    orderStatus: string;
    invoiceStatus: string;
    paidAt: Date | null;
    issuedAt: Date | null;
  }>(
    `SELECT o."number", o."fulfillmentMode"::text AS "fulfillmentMode",
            o."status" AS "orderStatus", i."status" AS "invoiceStatus",
            o."paidAt", i."issuedAt"
       FROM "Order" o
       JOIN "Invoice" i ON i."orderId" = o."id"
      WHERE o."number" IN ('ORD-ZERO-CERT-1', 'ORD-ZERO-CLAIM-CERT', 'ORD-ZERO-CERT-2')
      ORDER BY o."number"`,
  );
  const fulfilledRow = rows.rows.find((row) => row.number === "ORD-ZERO-CERT-1");
  const claimRow = rows.rows.find((row) => row.number === "ORD-ZERO-CLAIM-CERT");
  const rejectedRow = rows.rows.find((row) => row.number === "ORD-ZERO-CERT-2");
  if (
    !fulfilledRow ||
    fulfilledRow.fulfillmentMode !== "ACCOUNT_ENTITLEMENT" ||
    fulfilledRow.orderStatus !== "PAID" ||
    fulfilledRow.invoiceStatus !== "FINAL" ||
    !fulfilledRow.paidAt ||
    !fulfilledRow.issuedAt
  ) {
    throw new Error(`Zero-total direct persistence was not finalized: ${JSON.stringify(fulfilledRow)}`);
  }
  if (
    !claimRow ||
    claimRow.fulfillmentMode !== "CLAIM_CODE" ||
    claimRow.orderStatus !== "PAID" ||
    claimRow.invoiceStatus !== "FINAL"
  ) {
    throw new Error(`Zero-total claim persistence was not finalized: ${JSON.stringify(claimRow)}`);
  }
  if (!rejectedRow || rejectedRow.orderStatus !== "PENDING" || rejectedRow.invoiceStatus !== "DRAFT") {
    throw new Error(`Non-zero rejection mutated commercial state: ${JSON.stringify(rejectedRow)}`);
  }
  console.log("Commerce zero-payment direct + claim routing and idempotent retry GREEN");
} finally {
  await client.end();
}

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
const fulfillment = createCommerceZeroPaymentFulfillmentCapability({
  repository: createPostgresCommerceZeroPaymentFulfillmentRepository(connectionString),
  entitlements: {
    async grant() {
      grantCalls += 1;
      return { status: grantCalls === 1 ? ("GRANTED" as const) : ("EXISTING" as const) };
    },
  },
});

function orderInput(number: string, invoiceNumber: string, amountMinor: number) {
  return {
    accountId: "opaque-account",
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
  first.value.entitlementCount !== 1
) {
  throw new Error(`Expected fulfilled zero-total order: ${JSON.stringify(first)}`);
}

const retry = await fulfillment.fulfill({ orderId: zero.value.orderId, fulfilledAt });
if (retry.status !== "FULFILLED" || retry.value.entitlementCount !== 1 || grantCalls !== 2) {
  throw new Error(`Expected idempotent fulfillment retry: ${JSON.stringify(retry)} grants=${grantCalls}`);
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
    orderStatus: string;
    invoiceStatus: string;
    paidAt: Date | null;
    issuedAt: Date | null;
  }>(
    `SELECT o."number", o."status" AS "orderStatus", i."status" AS "invoiceStatus",
            o."paidAt", i."issuedAt"
       FROM "Order" o
       JOIN "Invoice" i ON i."orderId" = o."id"
      WHERE o."number" IN ('ORD-ZERO-CERT-1', 'ORD-ZERO-CERT-2')
      ORDER BY o."number"`,
  );
  const fulfilledRow = rows.rows.find((row) => row.number === "ORD-ZERO-CERT-1");
  const rejectedRow = rows.rows.find((row) => row.number === "ORD-ZERO-CERT-2");
  if (
    !fulfilledRow ||
    fulfilledRow.orderStatus !== "PAID" ||
    fulfilledRow.invoiceStatus !== "FINAL" ||
    !fulfilledRow.paidAt ||
    !fulfilledRow.issuedAt
  ) {
    throw new Error(`Zero-total persistence was not finalized: ${JSON.stringify(fulfilledRow)}`);
  }
  if (!rejectedRow || rejectedRow.orderStatus !== "PENDING" || rejectedRow.invoiceStatus !== "DRAFT") {
    throw new Error(`Non-zero rejection mutated commercial state: ${JSON.stringify(rejectedRow)}`);
  }
  console.log("Commerce zero-payment PAID/FINAL + idempotent entitlement retry GREEN");
} finally {
  await client.end();
}

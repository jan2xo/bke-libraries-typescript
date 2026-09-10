import assert from "node:assert/strict";
import { Client } from "pg";
import { createPaymentsRefundInitiationCapability } from "../logic/refund-initiation";
import type { PaymentsRefundProvider } from "../logic/refund-provider";
import { createPostgresPaymentsRefundRepository } from "../prisma/repositories/postgres-refund-repository";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const seed = new Client({ connectionString });
await seed.connect();
try {
  await seed.query(`
    INSERT INTO "PaymentSettlementFact" (
      "id", "providerEventRecordId", "checkoutAttemptId", "provider", "eventId",
      "externalPaymentId", "externalCheckoutId", "commercialReference", "amountMinor",
      "currency", "livemode", "settledAt"
    ) VALUES
      (
        'refund-settlement', 'refund-event-row', 'refund-attempt', 'fakepay', 'evt-refund',
        'pay-refund', 'checkout-refund', 'ORDER-REFUND', 300000, 'PHP', false,
        '2026-09-02T00:00:00Z'
      ),
      (
        'refund-full-old', 'refund-full-event-old', 'refund-full-attempt-old', 'fakepay', 'evt-full-old',
        'pay-full-old', 'checkout-full-old', 'ORDER-FULL', 100000, 'PHP', false,
        '2026-09-01T00:00:00Z'
      ),
      (
        'refund-full-latest', 'refund-full-event-latest', 'refund-full-attempt-latest', 'fakepay', 'evt-full-latest',
        'pay-full-latest', 'checkout-full-latest', 'ORDER-FULL', 120000, 'PHP', false,
        '2026-09-03T00:00:00Z'
      )
  `);
} finally {
  await seed.end();
}

const keys: string[] = [];
const amounts: number[] = [];
const externalPayments: string[] = [];
const provider: PaymentsRefundProvider = {
  name: "fakepay",
  async createRefund(input) {
    keys.push(input.idempotencyKey);
    amounts.push(input.amountMinor);
    externalPayments.push(input.externalPaymentId);
    return {
      externalRefundId: `rfnd-${keys.length}`,
      status: "pending",
      amountMinor: input.amountMinor,
      externalPaymentId: input.externalPaymentId,
    };
  },
};

const capability = createPaymentsRefundInitiationCapability(
  createPostgresPaymentsRefundRepository(connectionString),
  provider,
);

const first = await capability.initiate({
  sourceReference: "refund-source-a",
  settlementFactId: "refund-settlement",
  amountMinor: 200000,
  reason: "requested_by_customer",
});
assert.equal(first.status, "REFUND");
assert.equal(first.status === "REFUND" && first.disposition, "CREATED");

const retry = await capability.initiate({
  sourceReference: "refund-source-a",
  settlementFactId: "refund-settlement",
  amountMinor: 200000,
  reason: "requested_by_customer",
});
assert.equal(retry.status, "REFUND");
assert.equal(retry.status === "REFUND" && retry.disposition, "EXISTING");
assert.equal(keys.length, 1);

const over = await capability.initiate({
  sourceReference: "refund-source-b",
  settlementFactId: "refund-settlement",
  amountMinor: 150000,
  reason: "other",
});
assert.deepEqual(over, { status: "REJECTED", code: "AMOUNT_EXCEEDS_SETTLEMENT" });
assert.equal(keys.length, 1);

const full = await capability.initiateFullByCommercialReference({
  sourceReference: "refund-full:ORDER-FULL",
  commercialReference: "ORDER-FULL",
  reason: "requested_by_customer",
  notes: "admin full refund",
});
assert.equal(full.status, "REFUND");
assert.equal(full.status === "REFUND" && full.disposition, "CREATED");
assert.equal(full.status === "REFUND" && full.value.settlementFactId, "refund-full-latest");
assert.equal(full.status === "REFUND" && full.value.amountMinor, 120000);
assert.equal(amounts.at(-1), 120000);
assert.equal(externalPayments.at(-1), "pay-full-latest");

const fullRetry = await capability.initiateFullByCommercialReference({
  sourceReference: "refund-full:ORDER-FULL",
  commercialReference: "ORDER-FULL",
  reason: "requested_by_customer",
  notes: "admin full refund",
});
assert.equal(fullRetry.status, "REFUND");
assert.equal(fullRetry.status === "REFUND" && fullRetry.disposition, "EXISTING");
assert.equal(keys.length, 2);

const missing = await capability.initiateFullByCommercialReference({
  sourceReference: "refund-full:missing",
  commercialReference: "ORDER-MISSING",
  reason: "other",
});
assert.deepEqual(missing, { status: "REJECTED", code: "SETTLEMENT_NOT_FOUND" });

const verify = new Client({ connectionString });
await verify.connect();
try {
  const rows = await verify.query(`SELECT * FROM "PaymentRefundOperation" WHERE "settlementFactId" = 'refund-settlement'`);
  assert.equal(rows.rowCount, 1);
  assert.equal(Number(rows.rows[0].amountMinor), 200000);
  assert.equal(rows.rows[0].state, "PENDING");
  assert.equal(rows.rows[0].externalPaymentId, "pay-refund");
  assert.equal(rows.rows[0].externalRefundId, "rfnd-1");

  const fullRows = await verify.query(`SELECT * FROM "PaymentRefundOperation" WHERE "sourceReference" = 'refund-full:ORDER-FULL'`);
  assert.equal(fullRows.rowCount, 1);
  assert.equal(fullRows.rows[0].settlementFactId, "refund-full-latest");
  assert.equal(Number(fullRows.rows[0].amountMinor), 120000);
  assert.equal(fullRows.rows[0].externalPaymentId, "pay-full-latest");
  assert.equal(fullRows.rows[0].externalRefundId, "rfnd-2");

  const foreignKeys = await verify.query(`
    SELECT count(*)::int AS count
      FROM pg_constraint
     WHERE contype = 'f'
       AND conrelid = '"PaymentRefundOperation"'::regclass
  `);
  assert.equal(foreignKeys.rows[0].count, 0);
} finally {
  await verify.end();
}

console.log("Payments refund initiation PostgreSQL certification GREEN");

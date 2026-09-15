import assert from "node:assert/strict";
import { Client } from "pg";
import { createPaymentsSettlementFactCapability } from "../logic/settlement-fact";
import { createPostgresPaymentsSettlementFactRepository } from "../prisma/repositories/postgres-settlement-fact-repository";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const client = new Client({ connectionString });
await client.connect();
try {
  await client.query(`INSERT INTO "PaymentCheckoutAttempt" ("id","sourceReference","commercialReference","provider","requestFingerprint","amountMinor","currency","payerSnapshot","itemsSnapshot","status","externalCheckoutId","checkoutUrl") VALUES ('settle-attempt','settle-source','ORDER-SETTLE','fakepay','rf',300000,'PHP','{}','[]','PENDING','checkout-settle','https://example.test')`);
  await client.query(`INSERT INTO "PaymentProviderEvent" ("id","provider","eventId","payloadHash","eventFingerprint","rawType","type","externalPaymentId","externalCheckoutId","reference","amountMinor","currency","livemode","occurredAt") VALUES ('settle-event','fakepay','evt-settle','hash','finger','payment.paid','payment.paid','payment-settle','checkout-settle','ORDER-SETTLE',300000,'PHP',false,'2026-09-02T00:00:00Z')`);
  await client.query(`INSERT INTO "PaymentCheckoutAttempt" ("id","sourceReference","commercialReference","provider","requestFingerprint","amountMinor","currency","payerSnapshot","itemsSnapshot","status","externalCheckoutId","checkoutUrl") VALUES ('late-cancelled-attempt','late-cancelled-source','ORDER-LATE-CANCELLED','fakepay','rf-late',125000,'PHP','{}','[]','CANCELLED','checkout-late-cancelled','https://example.test/late')`);
  await client.query(`INSERT INTO "PaymentProviderEvent" ("id","provider","eventId","payloadHash","eventFingerprint","rawType","type","externalPaymentId","externalCheckoutId","reference","amountMinor","currency","livemode","occurredAt") VALUES ('late-cancelled-event','fakepay','evt-late-cancelled','hash-late','finger-late','payment.paid','payment.paid','payment-late-cancelled','checkout-late-cancelled','ORDER-LATE-CANCELLED',125000,'PHP',false,'2026-09-02T01:00:00Z')`);
} finally {
  await client.end();
}

const capability = createPaymentsSettlementFactCapability(createPostgresPaymentsSettlementFactRepository(connectionString));
const first = await capability.reconcile({ providerEventRecordId: "settle-event", expectedLivemode: false });
const second = await capability.reconcile({ providerEventRecordId: "settle-event", expectedLivemode: false });
assert.equal(first.status, "SETTLED");
assert.equal(first.status === "SETTLED" && first.disposition, "CREATED");
assert.equal(second.status, "SETTLED");
assert.equal(second.status === "SETTLED" && second.disposition, "EXISTING");

const lateCancelled = await capability.reconcile({
  providerEventRecordId: "late-cancelled-event",
  expectedLivemode: false,
});
assert.equal(lateCancelled.status, "SETTLED");
assert.equal(lateCancelled.status === "SETTLED" && lateCancelled.disposition, "CREATED");
assert.equal(
  lateCancelled.status === "SETTLED" && lateCancelled.value.commercialReference,
  "ORDER-LATE-CANCELLED",
);

const verify = new Client({ connectionString });
await verify.connect();
try {
  const facts = await verify.query(`SELECT * FROM "PaymentSettlementFact" WHERE "providerEventRecordId" = 'settle-event'`);
  assert.equal(facts.rowCount, 1);
  assert.equal(Number(facts.rows[0].amountMinor), 300000);
  assert.equal(facts.rows[0].commercialReference, "ORDER-SETTLE");
  const lateFacts = await verify.query(`SELECT * FROM "PaymentSettlementFact" WHERE "providerEventRecordId" = 'late-cancelled-event'`);
  assert.equal(lateFacts.rowCount, 1);
  assert.equal(Number(lateFacts.rows[0].amountMinor), 125000);
  assert.equal(lateFacts.rows[0].commercialReference, "ORDER-LATE-CANCELLED");
  const foreignKeys = await verify.query(`SELECT count(*)::int AS count FROM pg_constraint WHERE contype = 'f' AND conrelid = '"PaymentSettlementFact"'::regclass`);
  assert.equal(foreignKeys.rows[0].count, 0);
} finally {
  await verify.end();
}
console.log("Payments settlement fact PostgreSQL certification GREEN");

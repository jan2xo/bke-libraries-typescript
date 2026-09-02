import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { createPaymentsProviderEventIngestionCapability } from "../logic/provider-event-ingestion";
import type { PaymentsProviderEventVerifier } from "../logic/provider-event-verifier";
import { createPostgresPaymentsProviderEventRepository } from "../prisma/repositories/postgres-provider-event-repository";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const eventId = `evt_${randomUUID()}`;
const reference = `BKE-EVENT-${randomUUID()}`;
const externalPaymentId = `pay_${randomUUID()}`;
const externalCheckoutId = `checkout_${randomUUID()}`;
let verificationCalls = 0;
const verifier: PaymentsProviderEventVerifier = {
  name: "cert-provider",
  async verifyAndParse() {
    verificationCalls += 1;
    return {
      eventId,
      rawType: "payment.paid",
      type: "payment.paid",
      externalPaymentId,
      externalCheckoutId,
      reference,
      amountMinor: 300_000,
      currency: "php",
      livemode: false,
      occurredAt: new Date("2026-09-02T00:00:00.000Z"),
    };
  },
};

const capability = createPaymentsProviderEventIngestionCapability(
  createPostgresPaymentsProviderEventRepository(connectionString),
  verifier,
);

const rawBody = new TextEncoder().encode(`{"event":"${eventId}"}`);
const first = await capability.ingest({ rawBody, headers: { signature: "certified" } });
if (first.status !== "VERIFIED" || first.disposition !== "CREATED") {
  throw new Error(`Expected CREATED provider event, got ${JSON.stringify(first)}`);
}

const retry = await capability.ingest({ rawBody, headers: { signature: "certified" } });
if (retry.status !== "VERIFIED" || retry.disposition !== "EXISTING") {
  throw new Error(`Expected EXISTING replay, got ${JSON.stringify(retry)}`);
}
if (first.value.providerEventRecordId !== retry.value.providerEventRecordId) {
  throw new Error("Replay changed provider-event record identity");
}
if (first.value.currency !== "PHP") throw new Error("Currency was not normalized");
if (verificationCalls !== 2) throw new Error("Every delivery must be independently verified before replay lookup");

const conflict = await capability.ingest({
  rawBody: new TextEncoder().encode(`{"event":"${eventId}","mutated":true}`),
  headers: { signature: "certified" },
});
if (conflict.status !== "REJECTED" || conflict.code !== "EVENT_CONFLICT") {
  throw new Error(`Expected EVENT_CONFLICT, got ${JSON.stringify(conflict)}`);
}

const client = new Client({ connectionString });
await client.connect();
try {
  const rows = await client.query(
    `SELECT "provider", "eventId", "type", "amountMinor", "currency", "livemode", "payloadHash", "eventFingerprint"
       FROM "PaymentProviderEvent"
      WHERE "provider" = $1 AND "eventId" = $2`,
    ["cert-provider", eventId],
  );
  if (rows.rowCount !== 1) throw new Error("Expected exactly one durable provider event");
  const row = rows.rows[0];
  if (row.type !== "payment.paid" || Number(row.amountMinor) !== 300_000 || row.currency !== "PHP") {
    throw new Error("Persisted normalized provider-event fact mismatch");
  }
  if (row.livemode !== false || !row.payloadHash || !row.eventFingerprint) {
    throw new Error("Provider-event evidence binding incomplete");
  }

  const foreignKeys = await client.query(
    `SELECT 1
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'PaymentProviderEvent' AND c.contype = 'f'`,
  );
  if (foreignKeys.rowCount !== 0) throw new Error("PaymentProviderEvent must not own cross-module foreign keys");
} finally {
  await client.end();
}

console.log("Payments provider-event ingestion PostgreSQL certification GREEN");

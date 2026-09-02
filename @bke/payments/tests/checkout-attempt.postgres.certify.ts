import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { createPaymentsCheckoutAttemptCapability } from "../logic/checkout-attempt";
import type { PaymentsCheckoutProvider } from "../logic/checkout-attempt-provider";
import { createPostgresPaymentsCheckoutAttemptRepository } from "../prisma/repositories/postgres-checkout-attempt-repository";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

let providerCalls = 0;
const provider: PaymentsCheckoutProvider = {
  name: "cert-provider",
  async createCheckout(input) {
    providerCalls += 1;
    return {
      externalCheckoutId: `cert-${input.idempotencyKey}`,
      checkoutUrl: `https://payments.example/checkout/${input.attemptId}`,
    };
  },
};

const capability = createPaymentsCheckoutAttemptCapability(
  createPostgresPaymentsCheckoutAttemptRepository(connectionString),
  provider,
);

const sourceReference = `cert:${randomUUID()}`;
const input = {
  sourceReference,
  commercialReference: `BKE-CERT-${randomUUID()}`,
  amountMinor: 300_000,
  currency: "PHP",
  payer: { name: "Certification Customer", email: "cert@example.com" },
  items: [{ name: "Certified capability", amountMinor: 300_000, quantity: 1 }],
} as const;

const first = await capability.create(input);
if (first.status !== "READY" || first.disposition !== "CREATED") {
  throw new Error(`Expected CREATED checkout, got ${JSON.stringify(first)}`);
}

const retry = await capability.create(input);
if (retry.status !== "READY" || retry.disposition !== "EXISTING") {
  throw new Error(`Expected EXISTING retry, got ${JSON.stringify(retry)}`);
}
if (providerCalls !== 1) throw new Error(`Expected one provider call, got ${providerCalls}`);
if (first.value.attemptId !== retry.value.attemptId) throw new Error("Idempotent retry changed attempt identity");

const conflict = await capability.create({
  ...input,
  amountMinor: 400_000,
  items: [{ name: "Certified capability", amountMinor: 400_000, quantity: 1 }],
});
if (conflict.status !== "REJECTED" || conflict.code !== "SOURCE_CONFLICT") {
  throw new Error(`Expected SOURCE_CONFLICT, got ${JSON.stringify(conflict)}`);
}

const client = new Client({ connectionString });
await client.connect();
try {
  const row = await client.query(
    `SELECT "status", "provider", "amountMinor", "currency", "externalCheckoutId", "checkoutUrl"
       FROM "PaymentCheckoutAttempt"
      WHERE "sourceReference" = $1`,
    [sourceReference],
  );
  if (row.rowCount !== 1) throw new Error("Expected exactly one durable Payments attempt");
  const value = row.rows[0];
  if (value.status !== "PENDING" || value.provider !== "cert-provider") throw new Error("Unexpected durable attempt state");
  if (Number(value.amountMinor) !== 300_000 || value.currency !== "PHP") throw new Error("Durable amount/currency mismatch");
  if (!value.externalCheckoutId || !value.checkoutUrl) throw new Error("Provider checkout binding missing");

  const foreignKeys = await client.query(
    `SELECT 1
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'PaymentCheckoutAttempt' AND c.contype = 'f'`,
  );
  if (foreignKeys.rowCount !== 0) throw new Error("Payments staging table must not own cross-module foreign keys");
} finally {
  await client.end();
}

console.log("Payments checkout-attempt PostgreSQL certification GREEN");

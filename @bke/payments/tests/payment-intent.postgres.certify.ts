import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { createPostgresPaymentsPaymentIntentRepository } from "../prisma/repositories/postgres-payment-intent-repository";
import { assertDisposablePaymentsPostgres } from "./payment-intent.postgres.guard";

// This guard MUST run before constructing a pg Client or invoking the repository.
const url = assertDisposablePaymentsPostgres(process.env.DATABASE_URL, {
  authorization: process.env.BKE_PAYMENTS_DISPOSABLE_DB_CERTIFICATION,
  githubActions: process.env.GITHUB_ACTIONS,
});
const repo = createPostgresPaymentsPaymentIntentRepository(url);
const suffix = randomUUID(), now = new Date(), id = randomUUID();
const claim = {
  id, sourceReference: "pi-cert-" + suffix, commercialReference: "order-" + suffix,
  provider: "paymongo", requestFingerprint: "a".repeat(64), amountMinor: 5000,
  currency: "PHP", paymentMethodAllowed: ["qrph"], livemode: false,
  idempotencyKey: "bke_pi_" + "b".repeat(64),
  idempotencyExpiresAt: new Date(now.getTime() + 86400000),
};
const at = (ms: number) => new Date(now.getTime() + ms);
const db = new Client({ connectionString: url });
await db.connect();
try {
  const claims = await Promise.all([repo.claim(claim), repo.claim({ ...claim, id: randomUUID() })]);
  assert.equal(claims.filter(x => x.created).length, 1);
  assert.equal(claims[0]!.record.id, claims[1]!.record.id);
  const initial = await Promise.all([repo.beginCreate(id, now, 30000), repo.beginCreate(id, now, 30000)]);
  assert.equal(initial.filter(x => x.status === "ACQUIRED").length, 1);
  assert.equal(initial.filter(x => x.status === "BUSY").length, 1);
  const first = initial.find(x => x.status === "ACQUIRED")!;
  const tokenA = first.record.createLeaseToken;
  assert.ok(tokenA);

  // A's provider call stalls, its 30-second lease expires, and B takes ownership.
  const second = await repo.beginCreate(id, at(31000), 30000);
  assert.equal(second.status, "ACQUIRED");
  const tokenB = second.record.createLeaseToken;
  assert.ok(tokenB);
  assert.notEqual(tokenA, tokenB);
  assert.equal(await repo.markFailed(id, "PROVIDER_REJECTED", tokenA), false);
  assert.equal(await repo.markUnknown(id, tokenA), false);
  const afterStaleFailure = await repo.findById(id);
  assert.equal(afterStaleFailure?.createLeaseToken, tokenB);
  assert.equal(afterStaleFailure?.status, "CREATING");
  assert.equal((await repo.beginCreate(id, at(32000), 30000)).status, "BUSY");

  const pi = "pi_cert_" + suffix.replace(/-/g, "");
  // Late success A must not bind while B owns the unbound attempt.
  await assert.rejects(
    () => repo.bindPaymentIntent(id, pi, "processing", tokenA, at(32000)),
    /obsolete lease|binding conflict/,
  );
  assert.equal((await repo.findById(id))?.paymentIntentId, null);
  const bound = await repo.bindPaymentIntent(id, pi, "awaiting_payment_method", tokenB, at(33000));
  assert.equal(bound.paymentIntentId, pi);
  assert.equal(bound.createLeaseToken, null);
  assert.equal((await repo.findByProviderIntent("paymongo", pi))?.id, id);
  assert.equal(await repo.markUnknown(id, tokenA), false);
  // An already-bound same identity is a read-only replay; never downgrade its state.
  const repeated = await repo.bindPaymentIntent(id, pi, "processing", tokenA, at(34000));
  assert.equal(repeated.status, "AWAITING_PAYMENT_METHOD");
  await assert.rejects(
    () => repo.bindPaymentIntent(id, "pi_different_" + suffix, "succeeded", tokenA, at(35000)),
    /obsolete lease|binding conflict/,
  );

  assert.equal((await repo.updateStatus(id, "awaiting_next_action", at(40000))).status, "AWAITING_NEXT_ACTION");
  // QR Ph expiry is a legitimate new observation and may return to awaiting_payment_method.
  assert.equal((await repo.updateStatus(id, "awaiting_payment_method", at(45000))).status, "AWAITING_PAYMENT_METHOD");
  assert.equal((await repo.updateStatus(id, "processing", at(50000))).status, "PROCESSING");
  // The older provider response arrives after the newer one: it must not win.
  assert.equal((await repo.updateStatus(id, "awaiting_next_action", at(46000))).status, "PROCESSING");
  assert.equal((await repo.updateStatus(id, "succeeded", at(60000))).status, "SUCCEEDED");
  assert.equal((await repo.updateStatus(id, "processing", at(70000))).status, "SUCCEEDED");
  assert.equal((await repo.updateStatus(id, "cancelled", at(80000))).status, "SUCCEEDED");
  assert.equal((await repo.updateStatus(id, "succeeded", at(90000))).status, "SUCCEEDED");
  const durable = await repo.findById(id);
  assert.equal(durable?.status, "SUCCEEDED");
  assert.equal(durable?.statusObservedAt?.getTime(), at(90000).getTime());

  console.log("Payments Payment Intent PostgreSQL concurrency, lease fencing and observation ordering GREEN");
} finally {
  await db.query('DELETE FROM "PaymentIntentAttempt" WHERE "sourceReference"=$1', [claim.sourceReference]);
  await db.end();
}

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { createPostgresPaymentsPaymentIntentRepository } from "../prisma/repositories/postgres-payment-intent-repository";
import { assertDisposablePaymentsPostgres } from "./payment-intent.postgres.guard";
const url=assertDisposablePaymentsPostgres(process.env.DATABASE_URL, {
  authorization: process.env.BKE_PAYMENTS_DISPOSABLE_DB_CERTIFICATION,
  githubActions: process.env.GITHUB_ACTIONS,
});
const repo=createPostgresPaymentsPaymentIntentRepository(url), suffix=randomUUID(), now=new Date(), id=randomUUID();
const claim={id,sourceReference:"pi-cert-"+suffix,commercialReference:"order-"+suffix,provider:"paymongo",requestFingerprint:"a".repeat(64),amountMinor:5000,currency:"PHP",paymentMethodAllowed:["qrph"],livemode:false,idempotencyKey:"bke_pi_"+ "b".repeat(64),idempotencyExpiresAt:new Date(now.getTime()+86400000)};
const db=new Client({connectionString:url});await db.connect();
try {
  const claims=await Promise.all([repo.claim(claim),repo.claim({...claim,id:randomUUID()})]);
  assert.equal(claims.filter(x=>x.created).length,1);assert.equal(claims[0]!.record.id,claims[1]!.record.id);
  const leases=await Promise.all([repo.beginCreate(id,now,30000),repo.beginCreate(id,now,30000)]);
  assert.equal(leases.filter(x=>x.status==="ACQUIRED").length,1);assert.equal(leases.filter(x=>x.status==="BUSY").length,1);
  await repo.markUnknown(id);const pi="pi_cert_"+suffix.replace(/-/g,"");const bound=await repo.bindPaymentIntent(id,pi,"awaiting_payment_method");
  assert.equal(bound.paymentIntentId,pi);assert.equal((await repo.findByProviderIntent("paymongo",pi))?.id,id);
  console.log("Payments Payment Intent PostgreSQL concurrency certification GREEN");
} finally {
  await db.query('DELETE FROM "PaymentIntentAttempt" WHERE "sourceReference"=$1',[claim.sourceReference]);await db.end();
}

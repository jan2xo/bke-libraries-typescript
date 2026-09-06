import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { createPostgresCommerceSubscriptionStatusLookupRepository } from "../prisma/repositories/postgres-subscription-status-lookup-repository";
const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Commerce PostgreSQL certification.");
const suffix = randomUUID();
const ids = ["PENDING", "ACTIVE", "PAST_DUE", "EXPIRED", "CANCELLED"].map((s) => `sub-${s}-${suffix}`);
const admin = new Client({ connectionString });
await admin.connect();
try {
  await admin.query(`INSERT INTO "Subscription" ("id","accountId","orderId","productId","status","seats","currentPeriodStart","currentPeriodEnd","renewalReminderAt","updatedAt") VALUES ${ids.map((_, i) => `($${i * 2 + 1}, 'opaque-account', 'opaque-order', 'opaque-product', $${i * 2 + 2}, 1, '2030-01-01', '2020-01-01', '2030-01-01', '2030-01-01')`).join(",")}`, ids.flatMap((id, i) => [id, ["PENDING", "ACTIVE", "PAST_DUE", "EXPIRED", "CANCELLED"][i]]));
  for (const table of ["CustomerAccount", "Product", "License"]) {
    const found = await admin.query("SELECT to_regclass($1) AS name", [`public."${table}"`]);
    assert.equal(found.rows[0].name, null, `Unexpected sibling table ${table}`);
  }
  const defaultsId = `sub-default-${suffix}`;
  ids.push(defaultsId);
  await admin.query(`INSERT INTO "Subscription" ("id","accountId","orderId","productId","seats","currentPeriodStart","currentPeriodEnd","renewalReminderAt","updatedAt") VALUES ($1,'opaque-a','opaque-o','opaque-p',1,'2026-01-01','2027-01-01','2026-12-01','2026-01-01')`, [defaultsId]);
  const defaults = await admin.query(`SELECT * FROM "Subscription" WHERE "id" = $1`, [defaultsId]);
  assert.equal(defaults.rows[0].status, "PENDING");
  assert.equal(defaults.rows[0].discountedCyclesConsumed, 0);
  for (const field of ["editionId", "purchasePlanId", "currency", "normalRecurringAmountMinor", "discountedRecurringAmountMinor", "promotionalDiscountBps", "discountedCyclesTotal", "offerId", "offerSnapshot", "pricingVersion"]) {
    assert.equal(defaults.rows[0][field], null);
  }
  assert(defaults.rows[0].createdAt instanceof Date);
  const before = await admin.query(`SELECT * FROM "Subscription" WHERE "id" = ANY($1) ORDER BY "id"`, [ids]);
  const repository = createPostgresCommerceSubscriptionStatusLookupRepository(connectionString);
  assert.equal(await repository.findById("missing"), null);
  assert.equal(await repository.findById("' OR 1=1 --"), null);
  for (let i = 0; i < 5; i++) { const result = await repository.findById(ids[i]!); assert(result); assert.equal(result.id, ids[i]); assert.equal(result.status, ["PENDING", "ACTIVE", "PAST_DUE", "EXPIRED", "CANCELLED"][i]); assert.equal(result.currentPeriodStart.toISOString(), "2030-01-01T00:00:00.000Z"); assert.equal(result.currentPeriodEnd.toISOString(), "2020-01-01T00:00:00.000Z"); }
  assert.equal(await repository.findById(` ${ids[0]} `), null);
  const defaultSnapshot = await repository.findById(defaultsId);
  assert.equal(defaultSnapshot?.status, "PENDING");
  const after = await admin.query(`SELECT * FROM "Subscription" WHERE "id" = ANY($1) ORDER BY "id"`, [ids]); assert.deepEqual(after.rows, before.rows);
  console.log("Commerce subscription lookup PostgreSQL GREEN");
} finally { await admin.query(`DELETE FROM "Subscription" WHERE "id" = ANY($1)`, [ids]).catch(() => undefined); await admin.end(); }

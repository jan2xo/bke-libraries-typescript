import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { createPostgresLicensingLicenseLookupRepository } from "../prisma/repositories/postgres-license-lookup-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Licensing PostgreSQL certification.");

const suffix = randomUUID();
const ids = [`lookup-active-${suffix}`, `lookup-suspended-${suffix}`, `lookup-expired-${suffix}`];
const hashes = [`exact-${suffix}`, `sql-like-${suffix}' OR 1=1 --`, `expired-${suffix}`];
const admin = new Client({ connectionString });
await admin.connect();
try {
  await admin.query(
    `INSERT INTO "License" ("id","publicId","keyHash","keyLastFour","accountId","orderId","orderItemId","productId","editionId","purchasePlanId","subscriptionId","status","maxSeats","maxDevicesPerSeat","expiresAt")
     VALUES ($1,$2,$3,'1111','opaque-account','opaque-order','opaque-item','opaque-product',NULL,NULL,NULL,'ACTIVE',3,2,NULL),
            ($4,$5,$6,'2222','opaque-account-2','opaque-order-2','opaque-item-2','opaque-product-2',NULL,'opaque-plan','opaque-sub','SUSPENDED',4,5,NULL),
            ($7,$8,$9,'3333','opaque-account-3','opaque-order-3','opaque-item-3','opaque-product-3','opaque-edition','opaque-plan-3',NULL,'EXPIRED',1,1,$10)`,
    [ids[0], `public-${ids[0]}`, hashes[0], ids[1], `public-${ids[1]}`, hashes[1], ids[2], `public-${ids[2]}`, hashes[2], new Date("2025-01-01T00:00:00.000Z")],
  );

  await admin.query(`UPDATE "License" SET "keyCiphertext" = 'fixture-secret-ciphertext' WHERE "id" = ANY($1)`, [ids]);
  const before = await admin.query(`SELECT * FROM "License" WHERE "id" = ANY($1) ORDER BY "id"`, [ids]);
  const repository = createPostgresLicensingLicenseLookupRepository(connectionString);
  if (await repository.findByKeyHash({ licenseKeyHash: `unknown-${suffix}` }) !== null) throw new Error("Unknown hash was found.");
  const active = await repository.findByKeyHash({ licenseKeyHash: hashes[0] });
  if (!active || active.id !== ids[0] || active.status !== "ACTIVE" || active.maxSeats !== 3 || active.maxDevicesPerSeat !== 2) throw new Error("Active lookup projection mismatch.");
  assert.equal(active.expiresAt, null);
  assert.equal(active.editionId, null);
  assert.equal(active.purchasePlanId, null);
  assert.equal(active.subscriptionId, null);
  assert.equal(active.keyRevealedAt, null);
  assert.equal(active.accountId, "opaque-account");
  assert.equal(active.orderItemId, "opaque-item");
  assert.equal(await repository.findByKeyHash({ licenseKeyHash: ` ${hashes[0]} ` }), null);
  assert.equal(await repository.findByKeyHash({ licenseKeyHash: "' OR 1=1 --" }), null);
  const suspended = await repository.findByKeyHash({ licenseKeyHash: hashes[1] });
  if (!suspended || suspended.status !== "SUSPENDED" || suspended.subscriptionId !== "opaque-sub") throw new Error("Suspended lookup was changed or lost opaque references.");
  const expired = await repository.findByKeyHash({ licenseKeyHash: hashes[2] });
  if (!expired || expired.status !== "EXPIRED" || expired.expiresAt?.toISOString() !== "2025-01-01T00:00:00.000Z") throw new Error("Expired lookup projection mismatch.");
  const sqlLike = await repository.findByKeyHash({ licenseKeyHash: hashes[1] });
  if (!sqlLike || sqlLike.id !== ids[1]) throw new Error("SQL-like hash was not matched exactly.");
  const serialized = JSON.stringify(active);
  if (serialized.includes("keyHash") || serialized.includes("keyCiphertext")) throw new Error("Secret fields leaked from lookup projection.");
  for (const snapshot of [active, suspended, expired]) {
    assert.equal("keyHash" in snapshot, false);
    assert.equal("keyCiphertext" in snapshot, false);
    assert.equal(JSON.stringify(snapshot).includes("fixture-secret-ciphertext"), false);
  }
  const after = await admin.query(`SELECT * FROM "License" WHERE "id" = ANY($1) ORDER BY "id"`, [ids]);
  assert.deepEqual(after.rows, before.rows);
  console.log("Licensing license lookup PostgreSQL GREEN: exact hash lookup, safe projection, opaque references, lifecycle preservation, and read-only behavior certified");
} finally {
  await admin.query(`DELETE FROM "License" WHERE "id" = ANY($1)`, [ids]).catch(() => undefined);
  await admin.end();
}

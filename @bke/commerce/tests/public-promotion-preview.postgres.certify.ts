import assert from "node:assert/strict";
import { Client } from "pg";
import { createCommercePublicPromotionPreviewCapability } from "../logic/public-promotion-preview";
import { createPostgresCommercePublicPromotionPreviewRepository } from "../prisma/repositories/postgres-public-promotion-preview-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required.");

const client = new Client({ connectionString });
await client.connect();
try {
  await client.query(
    `DELETE FROM "DiscountOffer" WHERE "id" IN ('preview-global','preview-plan','preview-monthly')`,
  );
  await client.query(
    `INSERT INTO "DiscountOffer" (
       "id","codeNormalized","name","type","status","discountBps","startsAt","endsAt",
       "productId","editionId","purchasePlanId","customerAccountId","maximumRedemptions",
       "perAccountRedemptionLimit","discountedBillingCycles","allowZeroTotal","createdById","createdAt","updatedAt","revokedAt"
     ) VALUES
       ('preview-global',NULL,'Global','GENERAL_PROMOTION','ACTIVE',1000,'2026-09-01T00:00:00Z',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,FALSE,'certifier','2026-09-01T00:00:00Z','2026-09-01T00:00:00Z',NULL),
       ('preview-plan',NULL,'Plan','GENERAL_PROMOTION','ACTIVE',1250,'2026-09-01T00:00:00Z',NULL,'product-1','edition-1','plan-1',NULL,NULL,NULL,NULL,FALSE,'certifier','2026-09-02T00:00:00Z','2026-09-02T00:00:00Z',NULL),
       ('preview-monthly',NULL,'Monthly','GENERAL_PROMOTION','ACTIVE',2000,'2026-09-01T00:00:00Z',NULL,'product-1','edition-1','plan-1',NULL,NULL,NULL,2,FALSE,'certifier','2026-09-03T00:00:00Z','2026-09-03T00:00:00Z',NULL)`,
  );

  const capability = createCommercePublicPromotionPreviewCapability(
    createPostgresCommercePublicPromotionPreviewRepository(connectionString),
    () => new Date("2026-09-11T00:00:00.000Z"),
  );

  const monthly = await capability.preview({
    productId: "product-1",
    editionId: "edition-1",
    purchasePlanId: "plan-1",
    planType: "MONTHLY",
    baseMinor: 999,
  });
  assert.deepEqual(monthly, {
    status: "PRICED",
    value: {
      offerId: "preview-monthly",
      name: "Monthly",
      discountBps: 2000,
      discountedBillingCycles: 2,
      discountMinor: 200,
      finalMinor: 799,
    },
  });

  const annual = await capability.preview({
    productId: "product-1",
    editionId: "edition-1",
    purchasePlanId: "plan-1",
    planType: "ANNUAL",
    baseMinor: 999,
  });
  assert.deepEqual(annual, {
    status: "PRICED",
    value: {
      offerId: "preview-plan",
      name: "Plan",
      discountBps: 1250,
      discountedBillingCycles: null,
      discountMinor: 125,
      finalMinor: 874,
    },
  });

  const other = await capability.preview({
    productId: "product-2",
    editionId: "edition-2",
    purchasePlanId: "plan-2",
    planType: "PERPETUAL",
    baseMinor: 10_000,
  });
  assert.deepEqual(other, {
    status: "PRICED",
    value: {
      offerId: "preview-global",
      name: "Global",
      discountBps: 1000,
      discountedBillingCycles: null,
      discountMinor: 1000,
      finalMinor: 9000,
    },
  });

  console.log("Commerce public promotion preview PostgreSQL certification GREEN");
} finally {
  await client.query(
    `DELETE FROM "DiscountOffer" WHERE "id" IN ('preview-global','preview-plan','preview-monthly')`,
  ).catch(() => undefined);
  await client.end();
}

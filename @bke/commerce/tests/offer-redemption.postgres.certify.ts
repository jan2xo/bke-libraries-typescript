import { Client } from "pg";
import { createCommerceOfferRedemptionCapability } from "../logic/offer-redemption";
import { createPostgresCommerceOfferRedemptionRepository } from "../prisma/repositories/postgres-offer-redemption-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Commerce offer-redemption certification.");
}

const seed = new Client({ connectionString });
await seed.connect();
try {
  const externalTables = await seed.query<{ name: string | null }>(
    `SELECT to_regclass('public."Product"')::text AS "name"
     UNION ALL SELECT to_regclass('public."Edition"')::text
     UNION ALL SELECT to_regclass('public."CustomerAccount"')::text
     UNION ALL SELECT to_regclass('public."User"')::text`,
  );
  if (externalTables.rows.some((row) => row.name !== null)) {
    throw new Error(
      `Commerce offer certification must not depend on external module tables: ${JSON.stringify(externalTables.rows)}`,
    );
  }

  await seed.query(
    `INSERT INTO "DiscountOffer" (
       "id", "codeNormalized", "name", "type", "status", "discountBps", "startsAt",
       "productId", "maximumRedemptions", "perAccountRedemptionLimit", "allowZeroTotal", "createdById"
     ) VALUES (
       'offer-global-one', 'LAUNCH-25', 'Launch 25', 'GENERAL_PROMOTION', 'ACTIVE', 2500,
       CURRENT_TIMESTAMP - INTERVAL '1 hour', 'opaque-product', 1, 1, FALSE, 'opaque-creator'
     )`,
  );

  const capability = createCommerceOfferRedemptionCapability(
    createPostgresCommerceOfferRedemptionRepository(connectionString),
  );
  const reserve = (accountId: string, orderId: string) =>
    capability.reserve({
      code: " launch-25 ",
      accountId,
      orderId,
      productId: "opaque-product",
      baseMinor: 1000,
      currency: "php",
      pricingVersion: "pricing-v1",
    });

  const concurrent = await Promise.all([
    reserve("account-a", "order-a"),
    reserve("account-b", "order-b"),
  ]);
  const accepted = concurrent.filter((result) => result.status === "RESERVED");
  const rejected = concurrent.filter((result) => result.status === "REJECTED");
  if (accepted.length !== 1 || rejected.length !== 1) {
    throw new Error(`Expected one atomic reservation and one rejection: ${JSON.stringify(concurrent)}`);
  }
  if (rejected[0]?.status !== "REJECTED" || rejected[0].code !== "GLOBAL_LIMIT_REACHED") {
    throw new Error(`Expected GLOBAL_LIMIT_REACHED: ${JSON.stringify(rejected[0])}`);
  }
  const first = accepted[0];
  if (first?.status !== "RESERVED") {
    throw new Error("Expected a reserved redemption.");
  }
  if (
    first.redemption.discountBps !== 2500 ||
    first.redemption.discountMinor !== 250 ||
    first.redemption.finalMinor !== 750 ||
    first.redemption.currency !== "PHP"
  ) {
    throw new Error(`Unexpected pricing snapshot: ${JSON.stringify(first.redemption)}`);
  }

  const duplicate = await reserve(first.redemption.accountId, first.redemption.orderId);
  if (duplicate.status !== "RESERVED" || !duplicate.idempotent || duplicate.redemption.id !== first.redemption.id) {
    throw new Error(`Order reservation was not idempotent: ${JSON.stringify(duplicate)}`);
  }

  const released = await capability.transition({
    redemptionId: first.redemption.id,
    transition: "RELEASE",
  });
  if (released.status !== "UPDATED" || released.redemption.status !== "RELEASED") {
    throw new Error(`Expected RELEASED transition: ${JSON.stringify(released)}`);
  }

  const replacement = await reserve("account-c", "order-c");
  if (replacement.status !== "RESERVED") {
    throw new Error(`Released reservation did not free capacity: ${JSON.stringify(replacement)}`);
  }
  const applied = await capability.transition({
    redemptionId: replacement.redemption.id,
    transition: "APPLY",
  });
  if (applied.status !== "UPDATED" || applied.redemption.status !== "APPLIED") {
    throw new Error(`Expected APPLIED transition: ${JSON.stringify(applied)}`);
  }
  const refunded = await capability.transition({
    redemptionId: replacement.redemption.id,
    transition: "REFUND",
  });
  if (refunded.status !== "UPDATED" || refunded.redemption.status !== "REFUNDED") {
    throw new Error(`Expected REFUNDED transition: ${JSON.stringify(refunded)}`);
  }

  const afterRefund = await reserve("account-d", "order-d");
  if (afterRefund.status !== "REJECTED" || afterRefund.code !== "GLOBAL_LIMIT_REACHED") {
    throw new Error(`Refund unexpectedly restored promotion capacity: ${JSON.stringify(afterRefund)}`);
  }

  const invalidTransition = await capability.transition({
    redemptionId: replacement.redemption.id,
    transition: "RELEASE",
  });
  if (invalidTransition.status !== "REJECTED" || invalidTransition.code !== "INVALID_TRANSITION") {
    throw new Error(`Expected invalid transition rejection: ${JSON.stringify(invalidTransition)}`);
  }

  console.log("Commerce offer/redemption lifecycle + atomic limits GREEN");
} finally {
  await seed.end();
}

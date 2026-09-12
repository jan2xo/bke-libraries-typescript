import { Client } from "pg";
import { createCommerceSubscriptionLifecycleManagementCapability } from "../logic/subscription-lifecycle-management";
import { createPostgresCommerceSubscriptionLifecycleRepository } from "../prisma/repositories/postgres-subscription-lifecycle-management-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Commerce subscription lifecycle certification.");

const capability = createCommerceSubscriptionLifecycleManagementCapability(
  createPostgresCommerceSubscriptionLifecycleRepository(connectionString),
);

const startedAt = new Date("2026-01-15T12:00:00.000Z");
const started = await capability.start({
  accountId: "opaque-account-subscription-lifecycle",
  orderId: "opaque-order-subscription-lifecycle",
  productId: "opaque-product-subscription-lifecycle",
  editionId: "opaque-edition-subscription-lifecycle",
  purchasePlanId: "opaque-plan-subscription-lifecycle",
  seats: 4,
  intervalUnit: "MONTH",
  intervalCount: 1,
  now: startedAt,
  currency: "PHP",
  normalRecurringAmountMinor: 30_000,
  discountedRecurringAmountMinor: 25_000,
  promotionalDiscountBps: 500,
  discountedCyclesTotal: 3,
  offerId: "opaque-offer-subscription-lifecycle",
  offerSnapshot: { discountBps: 500, discountedBillingCycles: 3 },
  pricingVersion: "pricing-v1",
});
if (started.status !== "OK") throw new Error(`Subscription start failed: ${JSON.stringify(started)}`);
if (started.subscription.currentPeriodEnd.toISOString() !== "2026-02-15T12:00:00.000Z") {
  throw new Error(`Monthly period mismatch: ${started.subscription.currentPeriodEnd.toISOString()}`);
}
if (started.subscription.renewalReminderAt.toISOString() !== "2026-02-08T12:00:00.000Z") {
  throw new Error(`Monthly reminder mismatch: ${started.subscription.renewalReminderAt.toISOString()}`);
}
if (!started.discountedCycleConsumed || started.subscription.discountedCyclesConsumed !== 1) {
  throw new Error(`Initial discounted-cycle semantics mismatch: ${JSON.stringify(started)}`);
}

const renewed = await capability.renew({
  subscriptionId: started.subscription.id,
  intervalUnit: "MONTH",
  intervalCount: 1,
  now: new Date("2026-01-20T12:00:00.000Z"),
  settlementOfferId: "opaque-offer-subscription-lifecycle",
});
if (renewed.status !== "OK") throw new Error(`Subscription renewal failed: ${JSON.stringify(renewed)}`);
if (renewed.subscription.currentPeriodStart.toISOString() !== "2026-02-15T12:00:00.000Z") {
  throw new Error(`Renewal did not advance from the existing future period end: ${renewed.subscription.currentPeriodStart.toISOString()}`);
}
if (renewed.subscription.currentPeriodEnd.toISOString() !== "2026-03-15T12:00:00.000Z") {
  throw new Error(`Renewal end mismatch: ${renewed.subscription.currentPeriodEnd.toISOString()}`);
}
if (!renewed.discountedCycleConsumed || renewed.subscription.discountedCyclesConsumed !== 2) {
  throw new Error(`Renewal discounted-cycle semantics mismatch: ${JSON.stringify(renewed)}`);
}

const withoutOffer = await capability.renew({
  subscriptionId: started.subscription.id,
  intervalUnit: "MONTH",
  intervalCount: 1,
  now: new Date("2026-02-20T12:00:00.000Z"),
});
if (withoutOffer.status !== "OK") throw new Error(`Second renewal failed: ${JSON.stringify(withoutOffer)}`);
if (withoutOffer.discountedCycleConsumed || withoutOffer.subscription.discountedCyclesConsumed !== 2) {
  throw new Error(`Discount cycle changed without a settled offer: ${JSON.stringify(withoutOffer)}`);
}

const client = new Client({ connectionString });
await client.connect();
try {
  await client.query(
    `UPDATE "Subscription"
        SET "status" = 'EXPIRED',
            "currentPeriodEnd" = $2
      WHERE "id" = $1`,
    [started.subscription.id, new Date("2026-03-01T00:00:00.000Z")],
  );
} finally {
  await client.end();
}

const reactivatedAt = new Date("2026-04-10T09:30:00.000Z");
const reactivated = await capability.renew({
  subscriptionId: started.subscription.id,
  intervalUnit: "YEAR",
  intervalCount: 1,
  now: reactivatedAt,
  settlementOfferId: "opaque-offer-subscription-lifecycle",
});
if (reactivated.status !== "OK") throw new Error(`Reactivation renewal failed: ${JSON.stringify(reactivated)}`);
if (reactivated.subscription.status !== "ACTIVE" || reactivated.subscription.currentPeriodStart.toISOString() !== reactivatedAt.toISOString()) {
  throw new Error(`Expired subscription did not reactivate from now: ${JSON.stringify(reactivated)}`);
}
if (reactivated.subscription.currentPeriodEnd.toISOString() !== "2027-04-10T09:30:00.000Z") {
  throw new Error(`Annual renewal period mismatch: ${reactivated.subscription.currentPeriodEnd.toISOString()}`);
}
if (!reactivated.discountedCycleConsumed || reactivated.subscription.discountedCyclesConsumed !== 3) {
  throw new Error(`Final discounted cycle was not consumed exactly once: ${JSON.stringify(reactivated)}`);
}

const exhausted = await capability.renew({
  subscriptionId: started.subscription.id,
  intervalUnit: "YEAR",
  intervalCount: 1,
  now: reactivatedAt,
  settlementOfferId: "opaque-offer-subscription-lifecycle",
});
if (exhausted.status !== "OK" || exhausted.discountedCycleConsumed || exhausted.subscription.discountedCyclesConsumed !== 3) {
  throw new Error(`Discounted cycles exceeded configured total: ${JSON.stringify(exhausted)}`);
}

const missing = await capability.renew({
  subscriptionId: "missing-subscription",
  intervalUnit: "MONTH",
  intervalCount: 1,
  now: reactivatedAt,
});
if (missing.status !== "FAILED" || missing.code !== "SUBSCRIPTION_NOT_FOUND") {
  throw new Error(`Missing subscription did not fail closed: ${JSON.stringify(missing)}`);
}

console.log("Commerce subscription lifecycle PostgreSQL semantics GREEN");

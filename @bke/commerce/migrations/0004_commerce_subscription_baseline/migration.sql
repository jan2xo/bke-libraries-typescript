CREATE TYPE "CommerceSubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAST_DUE', 'EXPIRED', 'CANCELLED');
CREATE TABLE "Subscription" (
  "id" TEXT PRIMARY KEY, "accountId" TEXT NOT NULL, "orderId" TEXT NOT NULL, "productId" TEXT NOT NULL,
  "editionId" TEXT, "purchasePlanId" TEXT, "status" "CommerceSubscriptionStatus" NOT NULL DEFAULT 'PENDING',
  "seats" INTEGER NOT NULL, "currentPeriodStart" TIMESTAMP(3) NOT NULL, "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
  "renewalReminderAt" TIMESTAMP(3) NOT NULL, "currency" TEXT, "normalRecurringAmountMinor" INTEGER,
  "discountedRecurringAmountMinor" INTEGER, "promotionalDiscountBps" INTEGER, "discountedCyclesTotal" INTEGER,
  "discountedCyclesConsumed" INTEGER NOT NULL DEFAULT 0, "offerId" TEXT, "offerSnapshot" JSONB,
  "pricingVersion" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "Subscription_accountId_status_idx" ON "Subscription"("accountId", "status");

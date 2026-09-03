CREATE TYPE "CommercePurchasePlanType" AS ENUM ('PERPETUAL', 'MONTHLY', 'ANNUAL');
CREATE TYPE "CommerceRenewalBehavior" AS ENUM ('NONE', 'CUSTOMER_AUTHORIZED');
CREATE TYPE "CommerceBillingType" AS ENUM ('ONE_TIME', 'SUBSCRIPTION');
CREATE TYPE "CommerceIntervalUnit" AS ENUM ('MONTH', 'YEAR');

CREATE TABLE "Price" (
  "id" TEXT PRIMARY KEY,
  "productId" TEXT NOT NULL,
  "licensePolicyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'PHP',
  "billingType" "CommerceBillingType" NOT NULL,
  "intervalUnit" "CommerceIntervalUnit",
  "intervalCount" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE "PurchasePlan" (
  "id" TEXT PRIMARY KEY,
  "editionId" TEXT NOT NULL,
  "type" "CommercePurchasePlanType" NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'PHP',
  "amountMinor" INTEGER,
  "annualDiscountBps" INTEGER,
  "renewalBehavior" "CommerceRenewalBehavior" NOT NULL DEFAULT 'NONE',
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "monthlySourcePlanId" TEXT,
  "legacyPriceId" TEXT UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchasePlan_monthlySourcePlanId_fkey"
    FOREIGN KEY ("monthlySourcePlanId") REFERENCES "PurchasePlan"("id") ON DELETE CASCADE,
  CONSTRAINT "PurchasePlan_legacyPriceId_fkey"
    FOREIGN KEY ("legacyPriceId") REFERENCES "Price"("id") ON DELETE SET NULL,
  CONSTRAINT "PurchasePlan_editionId_type_key" UNIQUE ("editionId", "type")
);

CREATE INDEX "Price_productId_active_idx" ON "Price"("productId", "active");
CREATE INDEX "PurchasePlan_editionId_active_idx" ON "PurchasePlan"("editionId", "active");

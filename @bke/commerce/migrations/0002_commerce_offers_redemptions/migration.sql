CREATE TYPE "CommerceDiscountType" AS ENUM (
  'GENERAL_PROMOTION',
  'CUSTOMER_ACCOUNT_OFFER',
  'ADMINISTRATIVE_ADJUSTMENT'
);
CREATE TYPE "CommerceDiscountStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISABLED', 'REVOKED', 'EXPIRED');
CREATE TYPE "CommerceOfferRedemptionStatus" AS ENUM ('RESERVED', 'APPLIED', 'RELEASED', 'REFUNDED');

CREATE TABLE "DiscountOffer" (
  "id" TEXT PRIMARY KEY,
  "codeNormalized" TEXT UNIQUE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "type" "CommerceDiscountType" NOT NULL,
  "status" "CommerceDiscountStatus" NOT NULL DEFAULT 'DRAFT',
  "discountBps" INTEGER NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "productId" TEXT,
  "editionId" TEXT,
  "purchasePlanId" TEXT,
  "customerAccountId" TEXT,
  "maximumRedemptions" INTEGER,
  "perAccountRedemptionLimit" INTEGER,
  "discountedBillingCycles" INTEGER,
  "allowZeroTotal" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "DiscountOffer_discountBps_check" CHECK ("discountBps" BETWEEN 1 AND 10000),
  CONSTRAINT "DiscountOffer_maximumRedemptions_check" CHECK ("maximumRedemptions" IS NULL OR "maximumRedemptions" > 0),
  CONSTRAINT "DiscountOffer_perAccountRedemptionLimit_check" CHECK ("perAccountRedemptionLimit" IS NULL OR "perAccountRedemptionLimit" > 0),
  CONSTRAINT "DiscountOffer_discountedBillingCycles_check" CHECK ("discountedBillingCycles" IS NULL OR "discountedBillingCycles" > 0),
  CONSTRAINT "DiscountOffer_window_check" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt")
);

CREATE TABLE "OfferRedemption" (
  "id" TEXT PRIMARY KEY,
  "offerId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL UNIQUE,
  "status" "CommerceOfferRedemptionStatus" NOT NULL DEFAULT 'RESERVED',
  "discountBps" INTEGER NOT NULL,
  "discountedBillingCycles" INTEGER,
  "baseMinor" INTEGER NOT NULL,
  "discountMinor" INTEGER NOT NULL,
  "finalMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "pricingVersion" TEXT NOT NULL,
  "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "appliedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  CONSTRAINT "OfferRedemption_offerId_fkey"
    FOREIGN KEY ("offerId") REFERENCES "DiscountOffer"("id") ON DELETE RESTRICT,
  CONSTRAINT "OfferRedemption_amounts_check"
    CHECK ("baseMinor" >= 0 AND "discountMinor" >= 0 AND "finalMinor" >= 0 AND "discountMinor" + "finalMinor" = "baseMinor")
);

CREATE INDEX "DiscountOffer_status_startsAt_endsAt_idx"
  ON "DiscountOffer"("status", "startsAt", "endsAt");
CREATE INDEX "DiscountOffer_customerAccountId_status_idx"
  ON "DiscountOffer"("customerAccountId", "status");
CREATE INDEX "DiscountOffer_purchasePlanId_status_idx"
  ON "DiscountOffer"("purchasePlanId", "status");
CREATE INDEX "OfferRedemption_offerId_status_idx"
  ON "OfferRedemption"("offerId", "status");
CREATE INDEX "OfferRedemption_offerId_accountId_status_idx"
  ON "OfferRedemption"("offerId", "accountId", "status");
CREATE INDEX "OfferRedemption_accountId_status_idx"
  ON "OfferRedemption"("accountId", "status");

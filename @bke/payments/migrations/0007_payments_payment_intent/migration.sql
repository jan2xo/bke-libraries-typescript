DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentIntentAttemptStatus') THEN
    CREATE TYPE "PaymentIntentAttemptStatus" AS ENUM ('CREATING','UNKNOWN','AWAITING_PAYMENT_METHOD','AWAITING_NEXT_ACTION','PROCESSING','SUCCEEDED','CANCELLED','FAILED');
  END IF;
END $$;

CREATE TABLE "PaymentIntentAttempt" (
  "id" TEXT NOT NULL,
  "sourceReference" TEXT NOT NULL,
  "commercialReference" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "paymentMethodAllowed" TEXT[] NOT NULL,
  "livemode" BOOLEAN NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "idempotencyExpiresAt" TIMESTAMPTZ NOT NULL,
  "createDispatchedAt" TIMESTAMPTZ,
  "createLeaseUntil" TIMESTAMPTZ,
  "paymentIntentId" TEXT,
  "status" "PaymentIntentAttemptStatus" NOT NULL DEFAULT 'CREATING',
  "failureCode" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentIntentAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentIntentAttempt_amountMinor_check" CHECK ("amountMinor" > 0),
  CONSTRAINT "PaymentIntentAttempt_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "PaymentIntentAttempt_methods_check" CHECK (cardinality("paymentMethodAllowed") > 0),
  CONSTRAINT "PaymentIntentAttempt_lease_check" CHECK ("createLeaseUntil" IS NULL OR "paymentIntentId" IS NULL)
);
CREATE UNIQUE INDEX "PaymentIntentAttempt_sourceReference_key" ON "PaymentIntentAttempt"("sourceReference");
CREATE UNIQUE INDEX "PaymentIntentAttempt_provider_paymentIntentId_key" ON "PaymentIntentAttempt"("provider","paymentIntentId");
CREATE UNIQUE INDEX "PaymentIntentAttempt_provider_idempotencyKey_key" ON "PaymentIntentAttempt"("provider","idempotencyKey");
CREATE INDEX "PaymentIntentAttempt_provider_status_idx" ON "PaymentIntentAttempt"("provider","status");
CREATE INDEX "PaymentIntentAttempt_createdAt_idx" ON "PaymentIntentAttempt"("createdAt");

ALTER TABLE "PaymentProviderEvent" ADD COLUMN "paymentIntentId" TEXT;
ALTER TABLE "PaymentProviderEvent" DROP CONSTRAINT "PaymentProviderEvent_type_check";
ALTER TABLE "PaymentProviderEvent" ADD CONSTRAINT "PaymentProviderEvent_type_check" CHECK (
  "type" IN ('payment.paid','payment.failed','payment.refunded','payment.refund.updated','payment_intent.succeeded','payment_intent.awaiting_payment_method','qrph.expired','unknown')
);
CREATE INDEX "PaymentProviderEvent_paymentIntentId_idx" ON "PaymentProviderEvent"("paymentIntentId");

ALTER TABLE "PaymentSettlementFact" ALTER COLUMN "externalCheckoutId" DROP NOT NULL;
ALTER TABLE "PaymentSettlementFact" ADD COLUMN "paymentIntentId" TEXT;
ALTER TABLE "PaymentSettlementFact" ADD CONSTRAINT "PaymentSettlementFact_externalIdentity_check"
  CHECK ("externalCheckoutId" IS NOT NULL OR "paymentIntentId" IS NOT NULL);
CREATE UNIQUE INDEX "PaymentSettlementFact_provider_paymentIntentId_key" ON "PaymentSettlementFact"("provider","paymentIntentId");
CREATE INDEX "PaymentSettlementFact_paymentIntentId_idx" ON "PaymentSettlementFact"("paymentIntentId");

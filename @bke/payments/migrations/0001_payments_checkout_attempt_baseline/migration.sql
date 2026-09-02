CREATE TYPE "PaymentCheckoutAttemptStatus" AS ENUM ('CREATING', 'PENDING', 'FAILED');

CREATE TABLE "PaymentCheckoutAttempt" (
  "id" TEXT NOT NULL,
  "sourceReference" TEXT NOT NULL,
  "commercialReference" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "payerSnapshot" JSONB NOT NULL,
  "itemsSnapshot" JSONB NOT NULL,
  "status" "PaymentCheckoutAttemptStatus" NOT NULL DEFAULT 'CREATING',
  "externalCheckoutId" TEXT,
  "checkoutUrl" TEXT,
  "failureCode" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PaymentCheckoutAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentCheckoutAttempt_amountMinor_check" CHECK ("amountMinor" > 0),
  CONSTRAINT "PaymentCheckoutAttempt_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "PaymentCheckoutAttempt_pending_shape_check" CHECK (
    "status" <> 'PENDING' OR ("externalCheckoutId" IS NOT NULL AND "checkoutUrl" IS NOT NULL)
  ),
  CONSTRAINT "PaymentCheckoutAttempt_failed_shape_check" CHECK (
    "status" <> 'FAILED' OR "failureCode" IS NOT NULL
  )
);

CREATE UNIQUE INDEX "PaymentCheckoutAttempt_sourceReference_key"
  ON "PaymentCheckoutAttempt"("sourceReference");

CREATE UNIQUE INDEX "PaymentCheckoutAttempt_provider_externalCheckoutId_key"
  ON "PaymentCheckoutAttempt"("provider", "externalCheckoutId");

CREATE INDEX "PaymentCheckoutAttempt_provider_status_idx"
  ON "PaymentCheckoutAttempt"("provider", "status");

CREATE INDEX "PaymentCheckoutAttempt_createdAt_idx"
  ON "PaymentCheckoutAttempt"("createdAt");

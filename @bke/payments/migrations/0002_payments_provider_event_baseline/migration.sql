CREATE TABLE "PaymentProviderEvent" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "eventFingerprint" TEXT NOT NULL,
  "rawType" TEXT,
  "type" TEXT NOT NULL,
  "externalPaymentId" TEXT,
  "externalCheckoutId" TEXT,
  "reference" TEXT,
  "externalRefundId" TEXT,
  "refundStatus" TEXT,
  "amountMinor" INTEGER,
  "currency" TEXT,
  "livemode" BOOLEAN NOT NULL,
  "occurredAt" TIMESTAMPTZ NOT NULL,
  "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PaymentProviderEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentProviderEvent_amountMinor_check" CHECK ("amountMinor" IS NULL OR "amountMinor" >= 0),
  CONSTRAINT "PaymentProviderEvent_currency_check" CHECK ("currency" IS NULL OR "currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "PaymentProviderEvent_type_check" CHECK (
    "type" IN ('payment.paid', 'payment.failed', 'payment.refunded', 'payment.refund.updated', 'unknown')
  ),
  CONSTRAINT "PaymentProviderEvent_refundStatus_check" CHECK (
    "refundStatus" IS NULL OR "refundStatus" IN ('pending', 'succeeded', 'failed')
  )
);

CREATE UNIQUE INDEX "PaymentProviderEvent_provider_eventId_key"
  ON "PaymentProviderEvent"("provider", "eventId");

CREATE INDEX "PaymentProviderEvent_provider_type_occurredAt_idx"
  ON "PaymentProviderEvent"("provider", "type", "occurredAt");

CREATE INDEX "PaymentProviderEvent_externalPaymentId_idx"
  ON "PaymentProviderEvent"("externalPaymentId");

CREATE INDEX "PaymentProviderEvent_externalCheckoutId_idx"
  ON "PaymentProviderEvent"("externalCheckoutId");

CREATE INDEX "PaymentProviderEvent_reference_idx"
  ON "PaymentProviderEvent"("reference");

CREATE INDEX "PaymentProviderEvent_receivedAt_idx"
  ON "PaymentProviderEvent"("receivedAt");

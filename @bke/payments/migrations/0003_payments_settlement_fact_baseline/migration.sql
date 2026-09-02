CREATE TABLE IF NOT EXISTS "PaymentSettlementFact" (
  "id" TEXT PRIMARY KEY,
  "providerEventRecordId" TEXT NOT NULL UNIQUE,
  "checkoutAttemptId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "externalPaymentId" TEXT NOT NULL,
  "externalCheckoutId" TEXT NOT NULL,
  "commercialReference" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "livemode" BOOLEAN NOT NULL,
  "settledAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentSettlementFact_amountMinor_check" CHECK ("amountMinor" > 0),
  CONSTRAINT "PaymentSettlementFact_currency_check" CHECK (char_length("currency") = 3)
);

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentSettlementFact_provider_externalPaymentId_key"
  ON "PaymentSettlementFact"("provider", "externalPaymentId");
CREATE INDEX IF NOT EXISTS "PaymentSettlementFact_checkoutAttemptId_idx"
  ON "PaymentSettlementFact"("checkoutAttemptId");
CREATE INDEX IF NOT EXISTS "PaymentSettlementFact_commercialReference_idx"
  ON "PaymentSettlementFact"("commercialReference");
CREATE INDEX IF NOT EXISTS "PaymentSettlementFact_settledAt_idx"
  ON "PaymentSettlementFact"("settledAt");

CREATE TYPE "PaymentRefundOperationState" AS ENUM ('CREATING', 'PENDING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "PaymentRefundOperation" (
  "id" TEXT NOT NULL,
  "sourceReference" TEXT NOT NULL,
  "settlementFactId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "externalPaymentId" TEXT NOT NULL,
  "externalRefundId" TEXT,
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "notes" TEXT,
  "state" "PaymentRefundOperationState" NOT NULL DEFAULT 'CREATING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentRefundOperation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentRefundOperation_amountMinor_check" CHECK ("amountMinor" > 0),
  CONSTRAINT "PaymentRefundOperation_currency_check" CHECK (char_length("currency") = 3 AND "currency" = upper("currency")),
  CONSTRAINT "PaymentRefundOperation_reason_check" CHECK ("reason" IN ('requested_by_customer','duplicate','fraudulent','other'))
);

CREATE UNIQUE INDEX "PaymentRefundOperation_sourceReference_key" ON "PaymentRefundOperation"("sourceReference");
CREATE UNIQUE INDEX "PaymentRefundOperation_provider_externalRefundId_key" ON "PaymentRefundOperation"("provider", "externalRefundId");
CREATE INDEX "PaymentRefundOperation_settlementFactId_idx" ON "PaymentRefundOperation"("settlementFactId");
CREATE INDEX "PaymentRefundOperation_externalPaymentId_idx" ON "PaymentRefundOperation"("externalPaymentId");
CREATE INDEX "PaymentRefundOperation_state_idx" ON "PaymentRefundOperation"("state");
CREATE INDEX "PaymentRefundOperation_createdAt_idx" ON "PaymentRefundOperation"("createdAt");

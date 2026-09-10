CREATE TYPE "PaymentReconciliationState" AS ENUM ('MATCHED', 'OPEN', 'ACKNOWLEDGED');

CREATE TABLE "PaymentReconciliationRecord" (
  "id" TEXT NOT NULL,
  "commercialReference" TEXT NOT NULL,
  "settlementFactId" TEXT,
  "provider" TEXT NOT NULL,
  "externalPaymentId" TEXT,
  "classification" TEXT NOT NULL,
  "differences" JSONB NOT NULL,
  "localStatus" TEXT NOT NULL,
  "providerStatus" TEXT,
  "state" "PaymentReconciliationState" NOT NULL DEFAULT 'OPEN',
  "correlationId" TEXT NOT NULL,
  "runById" TEXT NOT NULL,
  "acknowledgedAt" TIMESTAMP(3),
  "acknowledgedById" TEXT,
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentReconciliationRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentReconciliationRecord_correlationId_key" ON "PaymentReconciliationRecord"("correlationId");
CREATE INDEX "PaymentReconciliationRecord_commercialReference_createdAt_idx" ON "PaymentReconciliationRecord"("commercialReference", "createdAt");
CREATE INDEX "PaymentReconciliationRecord_settlementFactId_idx" ON "PaymentReconciliationRecord"("settlementFactId");
CREATE INDEX "PaymentReconciliationRecord_provider_externalPaymentId_idx" ON "PaymentReconciliationRecord"("provider", "externalPaymentId");
CREATE INDEX "PaymentReconciliationRecord_state_idx" ON "PaymentReconciliationRecord"("state");

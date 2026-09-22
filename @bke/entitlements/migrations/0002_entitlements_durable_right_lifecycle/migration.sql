ALTER TYPE "EntitlementStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';
ALTER TYPE "EntitlementStatus" ADD VALUE IF NOT EXISTS 'REVOKED';

ALTER TABLE "Entitlement"
  ADD COLUMN "statusChangedAt" TIMESTAMP(3),
  ADD COLUMN "statusReason" TEXT;

ALTER TABLE "Entitlement"
  ADD CONSTRAINT "Entitlement_statusReason_length_check"
  CHECK ("statusReason" IS NULL OR char_length("statusReason") BETWEEN 1 AND 128);

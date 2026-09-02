CREATE TYPE "EntitlementStatus" AS ENUM ('ACTIVE');

CREATE TABLE "Entitlement" (
  "id" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "sourceReference" TEXT NOT NULL,
  "status" "EntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
  "quantity" INTEGER NOT NULL,
  "scopeSnapshot" JSONB NOT NULL,
  "grantSnapshot" JSONB NOT NULL,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Entitlement_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "Entitlement_validity_check" CHECK ("validUntil" IS NULL OR "validUntil" > "validFrom")
);

CREATE UNIQUE INDEX "Entitlement_sourceReference_key"
  ON "Entitlement"("sourceReference");
CREATE INDEX "Entitlement_subjectId_status_idx"
  ON "Entitlement"("subjectId", "status");
CREATE INDEX "Entitlement_resourceId_status_idx"
  ON "Entitlement"("resourceId", "status");
CREATE INDEX "Entitlement_validUntil_idx"
  ON "Entitlement"("validUntil");

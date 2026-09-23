ALTER TYPE "EntitlementStatus" ADD VALUE IF NOT EXISTS 'REVOKED';

ALTER TABLE "Entitlement"
  ADD COLUMN "revokedAt" TIMESTAMP(3),
  ADD COLUMN "revocationReference" TEXT,
  ADD COLUMN "revocationSnapshot" JSONB;

ALTER TABLE "Entitlement"
  ADD CONSTRAINT "Entitlement_revocation_shape_check" CHECK (
    (
      "status" = 'ACTIVE'
      AND "revokedAt" IS NULL
      AND "revocationReference" IS NULL
      AND "revocationSnapshot" IS NULL
    )
    OR
    (
      "status" = 'REVOKED'
      AND "revokedAt" IS NOT NULL
      AND "revocationReference" IS NOT NULL
      AND "revocationSnapshot" IS NOT NULL
    )
  );

CREATE INDEX "Entitlement_revocationReference_idx"
  ON "Entitlement"("revocationReference");

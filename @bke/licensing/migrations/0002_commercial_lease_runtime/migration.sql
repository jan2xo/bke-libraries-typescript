ALTER TABLE "DeviceActivation"
  ADD COLUMN "installationId" TEXT,
  ADD COLUMN "clientVersion" TEXT,
  ADD COLUMN "isVirtualMachine" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isContainer" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "DeviceActivation_licenseId_installationId_key"
  ON "DeviceActivation"("licenseId", "installationId");

ALTER TABLE "LicenseLeaseRecord"
  ADD COLUMN "refreshAfter" TIMESTAMP(3);

CREATE TABLE "CommercialSigningKey" (
  "keyId" TEXT NOT NULL,
  "publicKey" TEXT NOT NULL,
  "privateKeyReference" TEXT NOT NULL,
  "algorithm" TEXT NOT NULL DEFAULT 'Ed25519',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "activeFrom" TIMESTAMP(3) NOT NULL,
  "activeTo" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommercialSigningKey_pkey" PRIMARY KEY ("keyId")
);

CREATE INDEX "CommercialSigningKey_status_activeFrom_activeTo_idx"
  ON "CommercialSigningKey"("status", "activeFrom", "activeTo");

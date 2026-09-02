CREATE TYPE "LicenseStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED');

CREATE TABLE "License" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "keyLastFour" TEXT NOT NULL,
  "keyCiphertext" TEXT,
  "keyRevealedAt" TIMESTAMP(3),
  "accountId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "editionId" TEXT,
  "purchasePlanId" TEXT,
  "subscriptionId" TEXT,
  "status" "LicenseStatus" NOT NULL DEFAULT 'ACTIVE',
  "maxSeats" INTEGER NOT NULL,
  "maxDevicesPerSeat" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "License_publicId_key" ON "License"("publicId");
CREATE UNIQUE INDEX "License_keyHash_key" ON "License"("keyHash");
CREATE INDEX "License_accountId_status_idx" ON "License"("accountId", "status");
CREATE INDEX "License_productId_status_idx" ON "License"("productId", "status");
CREATE INDEX "License_subscriptionId_idx" ON "License"("subscriptionId");

CREATE TABLE "LicenseAssignment" (
  "id" TEXT NOT NULL,
  "licenseId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LicenseAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LicenseAssignment_licenseId_userId_key" ON "LicenseAssignment"("licenseId", "userId");

CREATE TABLE "DeviceActivation" (
  "id" TEXT NOT NULL,
  "licenseId" TEXT NOT NULL,
  "deviceHash" TEXT NOT NULL,
  "label" TEXT,
  "machineIdHint" TEXT,
  "operatingSystem" TEXT,
  "architecture" TEXT,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deactivatedAt" TIMESTAMP(3),
  CONSTRAINT "DeviceActivation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeviceActivation_licenseId_deviceHash_key" ON "DeviceActivation"("licenseId", "deviceHash");
CREATE INDEX "DeviceActivation_licenseId_active_idx" ON "DeviceActivation"("licenseId", "active");

CREATE TABLE "LicenseEvent" (
  "id" TEXT NOT NULL,
  "licenseId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LicenseEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LicenseEvent_licenseId_createdAt_idx" ON "LicenseEvent"("licenseId", "createdAt");

CREATE TABLE "LicenseLeaseRecord" (
  "id" TEXT NOT NULL,
  "licenseId" TEXT NOT NULL,
  "leaseId" TEXT NOT NULL,
  "generation" INTEGER NOT NULL,
  "serverRevision" INTEGER NOT NULL,
  "installationId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "operationId" TEXT,
  "signerKeyId" TEXT,
  "expiresAt" TIMESTAMP(3),
  "leasePayload" TEXT,
  "leaseSignature" TEXT,
  "supersededById" TEXT,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LicenseLeaseRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LicenseLeaseRecord_leaseId_key" ON "LicenseLeaseRecord"("leaseId");
CREATE UNIQUE INDEX "LicenseLeaseRecord_operationId_key" ON "LicenseLeaseRecord"("operationId");
CREATE INDEX "LicenseLeaseRecord_licenseId_installationId_deviceId_generation_serverRevision_idx"
  ON "LicenseLeaseRecord"("licenseId", "installationId", "deviceId", "generation", "serverRevision");

CREATE TABLE "CommercialLeaseOperation" (
  "id" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "licenseId" TEXT,
  "action" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "resultLeaseId" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "CommercialLeaseOperation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CommercialLeaseOperation_operationId_key" ON "CommercialLeaseOperation"("operationId");
CREATE UNIQUE INDEX "CommercialLeaseOperation_resultLeaseId_key" ON "CommercialLeaseOperation"("resultLeaseId");
CREATE INDEX "CommercialLeaseOperation_licenseId_action_status_idx"
  ON "CommercialLeaseOperation"("licenseId", "action", "status");

ALTER TABLE "LicenseAssignment"
  ADD CONSTRAINT "LicenseAssignment_licenseId_fkey"
  FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeviceActivation"
  ADD CONSTRAINT "DeviceActivation_licenseId_fkey"
  FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LicenseEvent"
  ADD CONSTRAINT "LicenseEvent_licenseId_fkey"
  FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LicenseLeaseRecord"
  ADD CONSTRAINT "LicenseLeaseRecord_licenseId_fkey"
  FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LicenseLeaseRecord"
  ADD CONSTRAINT "LicenseLeaseRecord_supersededById_fkey"
  FOREIGN KEY ("supersededById") REFERENCES "LicenseLeaseRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommercialLeaseOperation"
  ADD CONSTRAINT "CommercialLeaseOperation_licenseId_fkey"
  FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LicenseLeaseRecord"
  ADD CONSTRAINT "LicenseLeaseRecord_operationId_fkey"
  FOREIGN KEY ("operationId") REFERENCES "CommercialLeaseOperation"("operationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommercialLeaseOperation"
  ADD CONSTRAINT "CommercialLeaseOperation_resultLeaseId_fkey"
  FOREIGN KEY ("resultLeaseId") REFERENCES "LicenseLeaseRecord"("leaseId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CommercialSigningKey" (
  "id" TEXT NOT NULL,
  "keyId" TEXT NOT NULL,
  "algorithm" TEXT NOT NULL DEFAULT 'Ed25519',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "publicKey" TEXT NOT NULL,
  "privateKeyReference" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retiredAt" TIMESTAMP(3),
  "rotationReason" TEXT,
  "createdBy" TEXT,
  CONSTRAINT "CommercialSigningKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommercialSigningKey_keyId_key"
  ON "CommercialSigningKey"("keyId");

CREATE INDEX "CommercialSigningKey_status_idx"
  ON "CommercialSigningKey"("status");

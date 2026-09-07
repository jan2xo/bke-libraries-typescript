CREATE TABLE IF NOT EXISTS "ProductGraceOverride" (
  "id" TEXT PRIMARY KEY,
  "productKey" TEXT NOT NULL,
  "graceEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductGraceOverride_productKey_key"
  ON "ProductGraceOverride" ("productKey");

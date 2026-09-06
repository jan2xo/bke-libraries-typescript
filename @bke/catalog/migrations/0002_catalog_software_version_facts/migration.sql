ALTER TABLE "CatalogProduct"
  ADD COLUMN IF NOT EXISTS "minimumAcceptedVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "maximumAcceptedVersion" TEXT;

CREATE TABLE IF NOT EXISTS "CatalogProductVersion" (
  "id" TEXT PRIMARY KEY,
  "productId" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "lifecycle" TEXT NOT NULL DEFAULT 'DRAFT',
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT "CatalogProductVersion_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "CatalogProduct"("id") ON DELETE CASCADE,
  CONSTRAINT "CatalogProductVersion_productId_version_key" UNIQUE ("productId", "version")
);

CREATE INDEX IF NOT EXISTS "CatalogProductVersion_productId_active_idx"
  ON "CatalogProductVersion" ("productId", "active");

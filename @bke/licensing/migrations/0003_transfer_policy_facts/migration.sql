CREATE TABLE IF NOT EXISTS "LicensePolicy" (
  "id" TEXT PRIMARY KEY,
  "productId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "transferable" BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS "LicensePolicy_productId_idx"
  ON "LicensePolicy" ("productId");

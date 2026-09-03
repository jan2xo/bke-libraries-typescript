CREATE TABLE IF NOT EXISTS "CatalogProduct" (
  "id" TEXT PRIMARY KEY,
  "slug" TEXT NOT NULL UNIQUE,
  "productId" TEXT UNIQUE,
  "name" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'SOFTWARE',
  "category" TEXT NOT NULL DEFAULT 'General',
  "featured" BOOLEAN NOT NULL DEFAULT FALSE,
  "imageKey" TEXT,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "publishedAt" TIMESTAMPTZ,
  "archivedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "CatalogProduct_kind_active_idx"
  ON "CatalogProduct" ("kind", "active");
CREATE INDEX IF NOT EXISTS "CatalogProduct_active_publishedAt_idx"
  ON "CatalogProduct" ("active", "publishedAt");

CREATE TABLE IF NOT EXISTS "CatalogEdition" (
  "id" TEXT PRIMARY KEY,
  "productId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "features" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "maxUsers" INTEGER NOT NULL DEFAULT 1,
  "maxDevicesPerUser" INTEGER NOT NULL DEFAULT 1,
  "updatePolicy" TEXT NOT NULL DEFAULT 'LIFETIME',
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CatalogEdition_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "CatalogProduct"("id") ON DELETE CASCADE,
  CONSTRAINT "CatalogEdition_productId_slug_key" UNIQUE ("productId", "slug"),
  CONSTRAINT "CatalogEdition_maxUsers_check" CHECK ("maxUsers" >= 1),
  CONSTRAINT "CatalogEdition_maxDevicesPerUser_check" CHECK ("maxDevicesPerUser" >= 1)
);

CREATE INDEX IF NOT EXISTS "CatalogEdition_productId_active_sortOrder_idx"
  ON "CatalogEdition" ("productId", "active", "sortOrder");

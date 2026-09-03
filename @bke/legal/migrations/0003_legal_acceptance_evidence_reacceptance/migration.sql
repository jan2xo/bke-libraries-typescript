ALTER TABLE "LegalDocumentVersion"
  ADD COLUMN "updatedAt" TIMESTAMP(3);

UPDATE "LegalDocumentVersion"
   SET "updatedAt" = COALESCE("publishedAt", "createdAt");

ALTER TABLE "LegalDocumentVersion"
  ALTER COLUMN "updatedAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "LegalAcceptance"
  ADD COLUMN "ipAddress" TEXT,
  ADD COLUMN "userAgent" TEXT;

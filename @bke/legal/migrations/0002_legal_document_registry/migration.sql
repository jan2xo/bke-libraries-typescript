ALTER TABLE "LegalDocumentVersion"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "requiresReacceptance" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "publishedAt" TIMESTAMP(3);

CREATE INDEX "LegalDocumentVersion_status_publishedAt_idx"
  ON "LegalDocumentVersion"("status", "publishedAt");

CREATE TABLE "LegalDocument" (
  "id" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "currentPublishedVersionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LegalDocument_documentType_key"
  ON "LegalDocument"("documentType");
CREATE UNIQUE INDEX "LegalDocument_slug_key"
  ON "LegalDocument"("slug");

ALTER TABLE "LegalDocument"
  ADD CONSTRAINT "LegalDocument_currentPublishedVersionId_fkey"
  FOREIGN KEY ("currentPublishedVersionId") REFERENCES "LegalDocumentVersion"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

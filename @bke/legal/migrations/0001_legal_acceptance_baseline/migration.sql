CREATE TABLE "LegalDocumentVersion" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "name" TEXT,
  "slug" TEXT,
  "markdownContent" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "slaVersion" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LegalDocumentVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LegalAcceptance" (
  "id" TEXT NOT NULL,
  "principalId" TEXT NOT NULL,
  "customerAccountId" TEXT,
  "documentId" TEXT NOT NULL,
  "documentVersionId" TEXT NOT NULL,
  "acceptanceContext" TEXT NOT NULL,
  "slaVersion" TEXT NOT NULL,
  "renderedContentSha256" TEXT NOT NULL,
  "variablesSnapshot" JSONB NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LegalAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LegalDocumentVersion_documentId_version_key"
  ON "LegalDocumentVersion"("documentId", "version");
CREATE INDEX "LegalDocumentVersion_documentId_createdAt_idx"
  ON "LegalDocumentVersion"("documentId", "createdAt");
CREATE INDEX "LegalAcceptance_principalId_acceptedAt_idx"
  ON "LegalAcceptance"("principalId", "acceptedAt");
CREATE INDEX "LegalAcceptance_customerAccountId_acceptedAt_idx"
  ON "LegalAcceptance"("customerAccountId", "acceptedAt");
CREATE INDEX "LegalAcceptance_documentId_documentVersionId_idx"
  ON "LegalAcceptance"("documentId", "documentVersionId");
CREATE INDEX "LegalAcceptance_principalId_customerAccountId_documentVersionId_acceptanceContext_idx"
  ON "LegalAcceptance"("principalId", "customerAccountId", "documentVersionId", "acceptanceContext");

ALTER TABLE "LegalAcceptance"
  ADD CONSTRAINT "LegalAcceptance_documentVersionId_fkey"
  FOREIGN KEY ("documentVersionId") REFERENCES "LegalDocumentVersion"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

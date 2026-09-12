CREATE TABLE "PrivacyRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "customerAccountId" TEXT,
  "requestType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "summary" TEXT NOT NULL,
  "responseSummary" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrivacyRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PrivacyRequestEvent" (
  "id" TEXT NOT NULL,
  "privacyRequestId" TEXT NOT NULL,
  "actorId" TEXT,
  "eventType" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrivacyRequestEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PrivacyRequest_userId_createdAt_idx" ON "PrivacyRequest"("userId", "createdAt");
CREATE INDEX "PrivacyRequest_customerAccountId_createdAt_idx" ON "PrivacyRequest"("customerAccountId", "createdAt");
CREATE INDEX "PrivacyRequest_status_createdAt_idx" ON "PrivacyRequest"("status", "createdAt");
CREATE INDEX "PrivacyRequest_requestType_status_idx" ON "PrivacyRequest"("requestType", "status");
CREATE INDEX "PrivacyRequestEvent_privacyRequestId_createdAt_idx" ON "PrivacyRequestEvent"("privacyRequestId", "createdAt");

ALTER TABLE "PrivacyRequestEvent"
  ADD CONSTRAINT "PrivacyRequestEvent_privacyRequestId_fkey"
  FOREIGN KEY ("privacyRequestId") REFERENCES "PrivacyRequest"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

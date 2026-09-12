CREATE TYPE "CommerceTrialSource" AS ENUM ('SELF_SERVICE', 'ADMIN');

CREATE TABLE "TrialGrant" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "source" "CommerceTrialSource" NOT NULL,
    "selfServiceYear" INTEGER,
    "trialStartsAt" TIMESTAMP(3) NOT NULL,
    "trialEndsAt" TIMESTAMP(3) NOT NULL,
    "graceEndsAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrialGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrialGrant_licenseId_key" ON "TrialGrant"("licenseId");
CREATE UNIQUE INDEX "TrialGrant_accountId_productId_selfServiceYear_key"
    ON "TrialGrant"("accountId", "productId", "selfServiceYear");
CREATE INDEX "TrialGrant_accountId_graceEndsAt_idx" ON "TrialGrant"("accountId", "graceEndsAt");
CREATE INDEX "TrialGrant_productId_createdAt_idx" ON "TrialGrant"("productId", "createdAt");

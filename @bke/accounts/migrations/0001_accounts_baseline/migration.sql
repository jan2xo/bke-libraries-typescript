CREATE TYPE "AccountsAccountType" AS ENUM ('INDIVIDUAL', 'ORGANIZATION');
CREATE TYPE "AccountsMemberRole" AS ENUM ('OWNER', 'BILLING', 'LICENSE_MANAGER', 'MEMBER');
CREATE TYPE "AccountsLifecycleState" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSURE_REQUESTED', 'CLOSED', 'PRIVACY_REVIEW', 'PSEUDONYMIZED', 'PURGE_ELIGIBLE');
CREATE TYPE "AccountsInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

CREATE TABLE "CustomerAccount" (
  "id" TEXT PRIMARY KEY,
  "type" "AccountsAccountType" NOT NULL,
  "displayName" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "billingEmail" TEXT NOT NULL,
  "taxId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lifecycleState" "AccountsLifecycleState" NOT NULL DEFAULT 'ACTIVE',
  "closureRequestedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "privacyRequestedAt" TIMESTAMP(3),
  "pseudonymizedAt" TIMESTAMP(3),
  "retentionExpiresAt" TIMESTAMP(3),
  "legalHoldAt" TIMESTAMP(3),
  "legalHoldReason" TEXT
);

CREATE TABLE "OrganizationProfile" (
  "accountId" TEXT PRIMARY KEY,
  "legalName" TEXT NOT NULL,
  "registrationNumber" TEXT,
  CONSTRAINT "OrganizationProfile_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE
);

CREATE TABLE "Membership" (
  "accountId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "AccountsMemberRole" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("accountId", "userId"),
  CONSTRAINT "Membership_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE
);

CREATE TABLE "Invitation" (
  "id" TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "AccountsMemberRole" NOT NULL,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "status" "AccountsInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Invitation_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE
);

CREATE INDEX "CustomerAccount_ownerId_idx" ON "CustomerAccount"("ownerId");
CREATE INDEX "CustomerAccount_lifecycleState_idx" ON "CustomerAccount"("lifecycleState");
CREATE INDEX "CustomerAccount_closedAt_idx" ON "CustomerAccount"("closedAt");
CREATE INDEX "CustomerAccount_retentionExpiresAt_idx" ON "CustomerAccount"("retentionExpiresAt");
CREATE INDEX "CustomerAccount_legalHoldAt_idx" ON "CustomerAccount"("legalHoldAt");
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");
CREATE INDEX "Invitation_accountId_email_idx" ON "Invitation"("accountId", "email");

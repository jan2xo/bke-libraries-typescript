CREATE TYPE "IdentityRole" AS ENUM ('CUSTOMER', 'ADMIN');
CREATE TYPE "IdentityLifecycleState" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSURE_REQUESTED', 'CLOSED', 'PRIVACY_REVIEW', 'PSEUDONYMIZED', 'PURGE_ELIGIBLE');
CREATE TYPE "MfaChallengePurpose" AS ENUM ('LOGIN', 'ENROLLMENT', 'RECENT_AUTH');
CREATE TYPE "SessionAuthenticationMethod" AS ENUM ('PASSWORD', 'PASSWORD_TOTP', 'PASSWORD_EMAIL_OTP', 'PASSWORD_RECOVERY', 'MAGIC_LINK', 'MFA_ENROLLMENT');
CREATE TYPE "SessionAssuranceLevel" AS ENUM ('BASIC', 'MFA_VERIFIED', 'RECENTLY_AUTHENTICATED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "emailVerified" TIMESTAMP(3),
  "role" "IdentityRole" NOT NULL DEFAULT 'CUSTOMER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "suspendedAt" TIMESTAMP(3),
  "lifecycleState" "IdentityLifecycleState" NOT NULL DEFAULT 'ACTIVE',
  "privacyRequestedAt" TIMESTAMP(3),
  "pseudonymizedAt" TIMESTAMP(3),
  "retentionExpiresAt" TIMESTAMP(3),
  "legalHoldAt" TIMESTAMP(3),
  "legalHoldReason" TEXT,
  "emailHash" TEXT,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PasswordCredential" (
  "userId" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordCredential_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastAuthenticatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "mfaVerifiedAt" TIMESTAMP(3),
  "recentAuthenticatedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "absoluteExpiresAt" TIMESTAMP(3) NOT NULL,
  "ipHash" TEXT,
  "userAgent" TEXT,
  "userAgentSummary" TEXT,
  "networkHint" TEXT,
  "authenticationMethod" "SessionAuthenticationMethod" NOT NULL DEFAULT 'PASSWORD',
  "assuranceLevel" "SessionAssuranceLevel" NOT NULL DEFAULT 'BASIC',
  "revokedAt" TIMESTAMP(3),
  "revocationReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdministratorMfaMethod" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "encryptedSecret" TEXT,
  "keyVersion" INTEGER NOT NULL DEFAULT 1,
  "pendingExpiresAt" TIMESTAMP(3),
  "enabledAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "disabledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdministratorMfaMethod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdministratorRecoveryCode" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdministratorRecoveryCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MfaChallenge" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "purpose" "MfaChallengePurpose" NOT NULL DEFAULT 'LOGIN',
  "tokenHash" TEXT NOT NULL,
  "codeHash" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MfaChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MfaChallenge_attempts_check" CHECK ("attemptCount" >= 0 AND "attemptCount" <= 5)
);

CREATE TABLE "EmergencyMfaEnrollmentAuthorization" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "recoveryReason" TEXT NOT NULL,
  "operatorIdentity" TEXT NOT NULL,
  "ownerKeyVersion" INTEGER NOT NULL,
  "deploymentEnvironment" TEXT NOT NULL,
  CONSTRAINT "EmergencyMfaEnrollmentAuthorization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VerificationToken" (
  "id" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PasswordResetToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_lifecycleState_idx" ON "User"("lifecycleState");
CREATE INDEX "User_retentionExpiresAt_idx" ON "User"("retentionExpiresAt");
CREATE INDEX "User_legalHoldAt_idx" ON "User"("legalHoldAt");

CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");
CREATE INDEX "Session_userId_absoluteExpiresAt_idx" ON "Session"("userId", "absoluteExpiresAt");
CREATE INDEX "Session_userId_lastSeenAt_idx" ON "Session"("userId", "lastSeenAt");

CREATE UNIQUE INDEX "AdministratorMfaMethod_userId_key" ON "AdministratorMfaMethod"("userId");
CREATE UNIQUE INDEX "AdministratorRecoveryCode_codeHash_key" ON "AdministratorRecoveryCode"("codeHash");
CREATE INDEX "AdministratorRecoveryCode_userId_usedAt_idx" ON "AdministratorRecoveryCode"("userId", "usedAt");
CREATE UNIQUE INDEX "MfaChallenge_tokenHash_key" ON "MfaChallenge"("tokenHash");
CREATE INDEX "MfaChallenge_userId_expiresAt_idx" ON "MfaChallenge"("userId", "expiresAt");
CREATE UNIQUE INDEX "EmergencyMfaEnrollmentAuthorization_tokenHash_key" ON "EmergencyMfaEnrollmentAuthorization"("tokenHash");
CREATE INDEX "EmergencyMfaEnrollmentAuthorization_userId_expiresAt_consum_idx" ON "EmergencyMfaEnrollmentAuthorization"("userId", "expiresAt", "consumedAt");
CREATE UNIQUE INDEX "VerificationToken_tokenHash_key" ON "VerificationToken"("tokenHash");
CREATE INDEX "VerificationToken_identifier_purpose_idx" ON "VerificationToken"("identifier", "purpose");
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");

ALTER TABLE "PasswordCredential" ADD CONSTRAINT "PasswordCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdministratorMfaMethod" ADD CONSTRAINT "AdministratorMfaMethod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdministratorRecoveryCode" ADD CONSTRAINT "AdministratorRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MfaChallenge" ADD CONSTRAINT "MfaChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmergencyMfaEnrollmentAuthorization" ADD CONSTRAINT "EmergencyMfaEnrollmentAuthorization_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

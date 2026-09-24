CREATE TYPE "IdentityFederatedProvider" AS ENUM ('GOOGLE');

ALTER TYPE "SessionAuthenticationMethod" ADD VALUE IF NOT EXISTS 'GOOGLE_OIDC';

CREATE TABLE "ExternalIdentity" (
  "id" TEXT NOT NULL,
  "provider" "IdentityFederatedProvider" NOT NULL,
  "subject" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emailAtLink" TEXT NOT NULL,
  "emailVerifiedAtLink" BOOLEAN NOT NULL,
  "nameAtLink" TEXT,
  "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastAuthenticatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastObservedEmail" TEXT NOT NULL,
  CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalIdentity_provider_subject_key"
  ON "ExternalIdentity"("provider","subject");
CREATE UNIQUE INDEX "ExternalIdentity_userId_provider_key"
  ON "ExternalIdentity"("userId","provider");
CREATE INDEX "ExternalIdentity_userId_idx" ON "ExternalIdentity"("userId");

ALTER TABLE "ExternalIdentity"
  ADD CONSTRAINT "ExternalIdentity_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

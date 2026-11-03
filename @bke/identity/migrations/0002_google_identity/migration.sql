ALTER TYPE "SessionAuthenticationMethod" ADD VALUE IF NOT EXISTS 'GOOGLE_OIDC';
ALTER TYPE "SessionAuthenticationMethod" ADD VALUE IF NOT EXISTS 'GOOGLE_OIDC_EMAIL_OTP';
ALTER TYPE "SessionAuthenticationMethod" ADD VALUE IF NOT EXISTS 'GOOGLE_OIDC_RECOVERY';
CREATE TABLE "GoogleIdentity"("userId" TEXT NOT NULL,"subject" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "GoogleIdentity_pkey" PRIMARY KEY("userId"));
CREATE UNIQUE INDEX "GoogleIdentity_subject_key" ON "GoogleIdentity"("subject");
ALTER TABLE "GoogleIdentity" ADD CONSTRAINT "GoogleIdentity_userId_fkey" FOREIGN KEY("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

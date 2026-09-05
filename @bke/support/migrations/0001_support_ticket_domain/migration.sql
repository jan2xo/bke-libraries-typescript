CREATE TYPE "SupportTicketCategory" AS ENUM ('ACCOUNT','PAYMENT','REFUND','INVOICE','LICENSE','DEVICE','DOWNLOAD','SECURITY','FEATURE_REQUEST','OTHER');
CREATE TYPE "SupportTicketState" AS ENUM ('OPEN','TRIAGED','WAITING_ON_CUSTOMER','WAITING_ON_SUPPORT','ESCALATED','RESOLVED','CLOSED');
CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW','NORMAL','HIGH','URGENT');
CREATE TYPE "SupportMessageVisibility" AS ENUM ('PUBLIC','INTERNAL');

CREATE TABLE "SupportTicket" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "orderId" TEXT,
  "licenseId" TEXT,
  "category" "SupportTicketCategory" NOT NULL,
  "state" "SupportTicketState" NOT NULL DEFAULT 'OPEN',
  "priority" "SupportTicketPriority" NOT NULL DEFAULT 'NORMAL',
  "subject" TEXT NOT NULL,
  "safeContext" JSONB NOT NULL,
  "securityReport" BOOLEAN NOT NULL DEFAULT FALSE,
  "assignedToId" TEXT,
  "lastCustomerReplyAt" TIMESTAMP(3),
  "lastAdminReplyAt" TIMESTAMP(3),
  "escalatedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SupportTicket_publicId_key" ON "SupportTicket"("publicId");
CREATE INDEX "SupportTicket_createdById_updatedAt_idx" ON "SupportTicket"("createdById", "updatedAt");
CREATE INDEX "SupportTicket_accountId_updatedAt_idx" ON "SupportTicket"("accountId", "updatedAt");
CREATE INDEX "SupportTicket_state_updatedAt_idx" ON "SupportTicket"("state", "updatedAt");
CREATE INDEX "SupportTicket_securityReport_priority_updatedAt_idx" ON "SupportTicket"("securityReport", "priority", "updatedAt");

CREATE TABLE "SupportTicketMessage" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "visibility" "SupportMessageVisibility" NOT NULL DEFAULT 'PUBLIC',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTicketMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupportTicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SupportTicketMessage_ticketId_createdAt_idx" ON "SupportTicketMessage"("ticketId", "createdAt");

CREATE TABLE "SupportTicketEvent" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "actorId" TEXT,
  "eventType" TEXT NOT NULL,
  "metadata" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTicketEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupportTicketEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SupportTicketEvent_ticketId_createdAt_idx" ON "SupportTicketEvent"("ticketId", "createdAt");

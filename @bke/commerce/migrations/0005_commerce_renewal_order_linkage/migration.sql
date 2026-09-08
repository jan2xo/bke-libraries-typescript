ALTER TABLE "Order"
ADD COLUMN IF NOT EXISTS "renewalSubscriptionId" TEXT;

CREATE INDEX IF NOT EXISTS "Order_renewalSubscriptionId_idx"
ON "Order"("renewalSubscriptionId");

-- Additive, per-operation fencing and observation ordering.
ALTER TABLE "PaymentIntentAttempt"
  ADD COLUMN "createLeaseToken" TEXT,
  ADD COLUMN "statusObservedAt" TIMESTAMPTZ;

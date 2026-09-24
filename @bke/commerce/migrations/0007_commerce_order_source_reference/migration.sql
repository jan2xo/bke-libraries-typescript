ALTER TABLE "Order"
  ADD COLUMN "sourceReference" TEXT;

CREATE UNIQUE INDEX "Order_sourceReference_key"
  ON "Order"("sourceReference");

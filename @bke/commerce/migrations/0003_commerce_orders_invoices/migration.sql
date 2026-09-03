CREATE TYPE "CommerceOrderStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED');
CREATE TYPE "CommerceInvoiceStatus" AS ENUM ('DRAFT', 'FINAL', 'VOID');

CREATE TABLE "Order" (
  "id" TEXT PRIMARY KEY,
  "number" TEXT NOT NULL UNIQUE,
  "accountId" TEXT NOT NULL,
  "status" "CommerceOrderStatus" NOT NULL DEFAULT 'PENDING',
  "currency" TEXT NOT NULL,
  "subtotalMinor" INTEGER NOT NULL,
  "taxMinor" INTEGER NOT NULL,
  "totalMinor" INTEGER NOT NULL,
  "billingSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt" TIMESTAMP(3)
);

CREATE TABLE "OrderItem" (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "priceId" TEXT NOT NULL,
  "policyId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "priceName" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitAmountMinor" INTEGER NOT NULL,
  "totalMinor" INTEGER NOT NULL,
  "billingType" "CommerceBillingType" NOT NULL,
  "policySnapshot" JSONB NOT NULL,
  "editionId" TEXT,
  "purchasePlanId" TEXT,
  "planName" TEXT,
  "planType" "CommercePurchasePlanType",
  "intervalUnit" "CommerceIntervalUnit",
  "intervalCount" INTEGER,
  "renewalBehavior" "CommerceRenewalBehavior",
  "entitlementSnapshot" JSONB,
  "pricingSnapshot" JSONB,
  "catalogAmountMinor" INTEGER,
  "offerId" TEXT,
  "offerDiscountBps" INTEGER,
  "offerDiscountMinor" INTEGER,
  "pricingVersion" TEXT,
  CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE
);

CREATE TABLE "Invoice" (
  "id" TEXT PRIMARY KEY,
  "number" TEXT NOT NULL UNIQUE,
  "orderId" TEXT NOT NULL UNIQUE,
  "status" "CommerceInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "customerSnapshot" JSONB NOT NULL,
  "currency" TEXT NOT NULL,
  "subtotalMinor" INTEGER NOT NULL,
  "taxMinor" INTEGER NOT NULL,
  "totalMinor" INTEGER NOT NULL,
  "issuedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE
);

CREATE TABLE "InvoiceLine" (
  "id" TEXT PRIMARY KEY,
  "invoiceId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitAmountMinor" INTEGER NOT NULL,
  "totalMinor" INTEGER NOT NULL,
  CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE
);

CREATE INDEX "Order_accountId_createdAt_idx" ON "Order"("accountId", "createdAt");
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

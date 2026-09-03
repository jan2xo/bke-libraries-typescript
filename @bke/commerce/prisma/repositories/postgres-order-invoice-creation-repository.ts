import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type {
  CommerceCreateOrderInvoiceInput,
  CommerceCreateOrderInvoiceResult,
} from "../../contracts/order-invoice-creation.contract";
import { calculateCommerceOrderLineTotal, calculateCommerceOrderTotals } from "../../logic/order-invoice-creation";
import type { CommerceOrderInvoiceCreationRepository } from "../../logic/order-invoice-creation-repository";

function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function createPostgresCommerceOrderInvoiceCreationRepository(
  connectionString: string,
): CommerceOrderInvoiceCreationRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Commerce PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async create(input: CommerceCreateOrderInvoiceInput): Promise<CommerceCreateOrderInvoiceResult> {
      const totals = calculateCommerceOrderTotals(input);
      if (!totals) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        await client.query("BEGIN");

        const duplicate = await client.query(
          `SELECT 1 FROM "Order" WHERE "number" = $1
           UNION ALL
           SELECT 1 FROM "Invoice" WHERE "number" = $2
           LIMIT 1`,
          [input.orderNumber, input.invoiceNumber],
        );
        if (duplicate.rowCount) {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "DUPLICATE_NUMBER" };
        }

        const orderId = randomUUID();
        const invoiceId = randomUUID();

        await client.query(
          `INSERT INTO "Order"
             ("id", "number", "accountId", "status", "currency", "subtotalMinor", "taxMinor", "totalMinor", "billingSnapshot")
           VALUES ($1, $2, $3, 'PENDING', $4, $5, $6, $7, $8::jsonb)`,
          [
            orderId,
            input.orderNumber,
            input.accountId,
            input.currency,
            totals.subtotalMinor,
            input.taxMinor,
            totals.totalMinor,
            json(input.billingSnapshot),
          ],
        );

        for (const line of input.lines) {
          const lineTotal = calculateCommerceOrderLineTotal(line);
          if (lineTotal === null) {
            throw new Error("Invalid Commerce order line total.");
          }
          await client.query(
            `INSERT INTO "OrderItem" (
               "id", "orderId", "productId", "priceId", "policyId", "productName", "priceName",
               "quantity", "unitAmountMinor", "totalMinor", "billingType", "policySnapshot", "editionId",
               "purchasePlanId", "planName", "planType", "intervalUnit", "intervalCount", "renewalBehavior",
               "entitlementSnapshot", "pricingSnapshot", "catalogAmountMinor", "offerId", "offerDiscountBps",
               "offerDiscountMinor", "pricingVersion"
             ) VALUES (
               $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16,
               $17, $18, $19, $20::jsonb, $21::jsonb, $22, $23, $24, $25, $26
             )`,
            [
              randomUUID(), orderId, line.productId, line.priceId, line.policyId, line.productName, line.priceName,
              line.quantity, line.unitAmountMinor, lineTotal, line.billingType, json(line.policySnapshot),
              line.editionId ?? null, line.purchasePlanId ?? null, line.planName ?? null, line.planType ?? null,
              line.intervalUnit ?? null, line.intervalCount ?? null, line.renewalBehavior ?? null,
              line.entitlementSnapshot === undefined ? null : json(line.entitlementSnapshot),
              line.pricingSnapshot === undefined ? null : json(line.pricingSnapshot),
              line.catalogAmountMinor ?? null, line.offerId ?? null, line.offerDiscountBps ?? null,
              line.offerDiscountMinor ?? null, line.pricingVersion ?? null,
            ],
          );
        }

        await client.query(
          `INSERT INTO "Invoice"
             ("id", "number", "orderId", "status", "customerSnapshot", "currency", "subtotalMinor", "taxMinor", "totalMinor")
           VALUES ($1, $2, $3, 'DRAFT', $4::jsonb, $5, $6, $7, $8)`,
          [
            invoiceId,
            input.invoiceNumber,
            orderId,
            json(input.customerSnapshot),
            input.currency,
            totals.subtotalMinor,
            input.taxMinor,
            totals.totalMinor,
          ],
        );

        for (const line of input.lines) {
          const lineTotal = calculateCommerceOrderLineTotal(line)!;
          await client.query(
            `INSERT INTO "InvoiceLine"
               ("id", "invoiceId", "description", "quantity", "unitAmountMinor", "totalMinor")
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [randomUUID(), invoiceId, line.description, line.quantity, line.unitAmountMinor, lineTotal],
          );
        }

        await client.query("COMMIT");
        return {
          status: "CREATED",
          value: {
            orderId,
            orderNumber: input.orderNumber,
            orderStatus: "PENDING",
            invoiceId,
            invoiceNumber: input.invoiceNumber,
            invoiceStatus: "DRAFT",
            currency: input.currency,
            subtotalMinor: totals.subtotalMinor,
            taxMinor: input.taxMinor,
            totalMinor: totals.totalMinor,
            lineCount: input.lines.length,
          },
        };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        if ((error as { code?: string }).code === "23505") {
          return { status: "REJECTED", code: "DUPLICATE_NUMBER" };
        }
        throw error;
      } finally {
        await client.end();
      }
    },
  });
}

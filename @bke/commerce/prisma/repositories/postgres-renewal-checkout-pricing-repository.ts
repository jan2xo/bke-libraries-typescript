import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type { CommercePrepareRenewalCheckoutResult } from "../../contracts/renewal-checkout-pricing.contract";
import { calculateCommerceOfferDiscount } from "../../logic/offer-redemption";
import type { CommerceRenewalCheckoutPricingRepository } from "../../logic/renewal-checkout-pricing-repository";

interface OrderRow {
  id: string;
  accountId: string;
  renewalSubscriptionId: string | null;
  status: "PENDING" | "PAID" | "CANCELLED" | "REFUNDED" | "PARTIALLY_REFUNDED";
  subtotalMinor: number;
  totalMinor: number;
}

interface InvoiceRow {
  id: string;
  status: "DRAFT" | "FINAL" | "VOID";
}

interface ItemRow {
  id: string;
  purchasePlanId: string | null;
  quantity: number;
  catalogAmountMinor: number | null;
  pricingSnapshot: unknown;
}

interface SubscriptionRow {
  id: string;
  accountId: string;
  purchasePlanId: string | null;
  normalRecurringAmountMinor: number | null;
  promotionalDiscountBps: number | null;
  discountedCyclesTotal: number | null;
  discountedCyclesConsumed: number;
  offerId: string | null;
  offerSnapshot: unknown;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function validMinor(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(Number(value)) && Number(value) >= 0;
}

function validDiscountBps(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 10000;
}

export function createPostgresCommerceRenewalCheckoutPricingRepository(
  connectionString: string,
): CommerceRenewalCheckoutPricingRepository {
  const normalized = connectionString.trim();
  if (!normalized) throw new Error("Commerce PostgreSQL connection string is required.");

  return Object.freeze({
    async prepare(orderId: string): Promise<CommercePrepareRenewalCheckoutResult> {
      const client = new Client({ connectionString: normalized });
      await client.connect();
      try {
        await client.query("BEGIN");

        const orderResult = await client.query<OrderRow>(
          `SELECT "id", "accountId", "renewalSubscriptionId", "status", "subtotalMinor", "totalMinor"
             FROM "Order"
            WHERE "id" = $1
            FOR UPDATE`,
          [orderId],
        );
        if (orderResult.rowCount !== 1) {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "ORDER_NOT_FOUND" };
        }
        const order = orderResult.rows[0]!;
        if (!order.renewalSubscriptionId) {
          await client.query("COMMIT");
          return { status: "READY", renewal: false };
        }
        if (order.status !== "PENDING") {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "RENEWAL_NOT_ELIGIBLE" };
        }

        const invoiceResult = await client.query<InvoiceRow>(
          `SELECT "id", "status" FROM "Invoice" WHERE "orderId" = $1 FOR UPDATE`,
          [order.id],
        );
        const itemResult = await client.query<ItemRow>(
          `SELECT "id", "purchasePlanId", "quantity", "catalogAmountMinor", "pricingSnapshot"
             FROM "OrderItem"
            WHERE "orderId" = $1
            ORDER BY "id"
            FOR UPDATE`,
          [order.id],
        );
        const invoice = invoiceResult.rows[0];
        const item = itemResult.rows.length === 1 ? itemResult.rows[0] : undefined;
        if (!invoice || invoice.status !== "DRAFT" || !item || item.quantity !== 1 || !item.purchasePlanId || !validMinor(item.catalogAmountMinor)) {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "RENEWAL_NOT_ELIGIBLE" };
        }

        const subscriptionResult = await client.query<SubscriptionRow>(
          `SELECT "id", "accountId", "purchasePlanId", "normalRecurringAmountMinor", "promotionalDiscountBps",
                  "discountedCyclesTotal", "discountedCyclesConsumed", "offerId", "offerSnapshot"
             FROM "Subscription"
            WHERE "id" = $1
            FOR UPDATE`,
          [order.renewalSubscriptionId],
        );
        const subscription = subscriptionResult.rows[0];
        if (
          !subscription ||
          subscription.accountId !== order.accountId ||
          subscription.purchasePlanId !== item.purchasePlanId
        ) {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "RENEWAL_NOT_ELIGIBLE" };
        }

        const baseMinor =
          validMinor(subscription.normalRecurringAmountMinor) && Number(subscription.normalRecurringAmountMinor) > 0
            ? Number(subscription.normalRecurringAmountMinor)
            : Number(item.catalogAmountMinor);
        const scheduledOfferApplied = Boolean(
          subscription.offerId &&
            subscription.discountedCyclesTotal &&
            Number(subscription.discountedCyclesTotal) > 0 &&
            Number(subscription.discountedCyclesConsumed) < Number(subscription.discountedCyclesTotal) &&
            validDiscountBps(subscription.promotionalDiscountBps),
        );
        const discount = scheduledOfferApplied
          ? calculateCommerceOfferDiscount({
              baseMinor,
              discountBps: Number(subscription.promotionalDiscountBps),
            })
          : { discountMinor: 0, finalMinor: baseMinor };
        const pricingSnapshot = {
          ...record(item.pricingSnapshot),
          catalogAmountMinor: baseMinor,
          finalAmountMinor: discount.finalMinor,
          ...(scheduledOfferApplied
            ? {
                offer: {
                  ...record(subscription.offerSnapshot),
                  id: subscription.offerId,
                  discountBps: Number(subscription.promotionalDiscountBps),
                  discountAmountMinor: discount.discountMinor,
                  discountedBillingCycles: subscription.discountedCyclesTotal,
                },
              }
            : {}),
        };

        await client.query(
          `UPDATE "Order" SET "subtotalMinor" = $2, "totalMinor" = $3 WHERE "id" = $1`,
          [order.id, discount.finalMinor, discount.finalMinor],
        );
        await client.query(
          `UPDATE "OrderItem"
              SET "catalogAmountMinor" = $2,
                  "unitAmountMinor" = $3,
                  "totalMinor" = $3,
                  "offerId" = $4,
                  "offerDiscountBps" = $5,
                  "offerDiscountMinor" = $6,
                  "pricingSnapshot" = $7::jsonb
            WHERE "id" = $1`,
          [
            item.id,
            baseMinor,
            discount.finalMinor,
            scheduledOfferApplied ? subscription.offerId : null,
            scheduledOfferApplied ? Number(subscription.promotionalDiscountBps) : null,
            scheduledOfferApplied ? discount.discountMinor : null,
            JSON.stringify(pricingSnapshot),
          ],
        );
        await client.query(
          `UPDATE "Invoice" SET "subtotalMinor" = $2, "totalMinor" = $3 WHERE "id" = $1`,
          [invoice.id, baseMinor, discount.finalMinor],
        );
        const invoiceLines = await client.query<{ id: string }>(
          `SELECT "id" FROM "InvoiceLine" WHERE "invoiceId" = $1 ORDER BY "id" FOR UPDATE`,
          [invoice.id],
        );
        if (invoiceLines.rowCount !== 1) {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "RENEWAL_NOT_ELIGIBLE" };
        }
        await client.query(
          `UPDATE "InvoiceLine" SET "unitAmountMinor" = $2, "totalMinor" = $2 WHERE "id" = $1`,
          [invoiceLines.rows[0]!.id, baseMinor],
        );
        if (scheduledOfferApplied && discount.discountMinor > 0) {
          const snapshot = record(subscription.offerSnapshot);
          const name = typeof snapshot.name === "string" && snapshot.name.trim() ? snapshot.name.trim() : "Promotional offer";
          const code = typeof snapshot.code === "string" && snapshot.code.trim() ? ` — code ${snapshot.code.trim()}` : "";
          const description = `Promotional discount — ${name}${code} (${(Number(subscription.promotionalDiscountBps) / 100).toFixed(2)}%)`;
          await client.query(
            `INSERT INTO "InvoiceLine" ("id", "invoiceId", "description", "quantity", "unitAmountMinor", "totalMinor")
             VALUES ($1, $2, $3, 1, $4, $4)`,
            [randomUUID(), invoice.id, description, -discount.discountMinor],
          );
        }

        await client.query("COMMIT");
        return {
          status: "READY",
          renewal: true,
          subtotalMinor: discount.finalMinor,
          totalMinor: discount.finalMinor,
          scheduledOfferApplied,
        };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        await client.end();
      }
    },
  });
}

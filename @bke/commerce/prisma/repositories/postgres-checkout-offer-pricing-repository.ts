import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type {
  CommerceCheckoutOfferScope,
  CommerceCheckoutOfferSnapshot,
  CommerceCheckoutOfferType,
  CommercePriceCheckoutOfferResult,
} from "../../contracts/checkout-offer-pricing.contract";
import { calculateCommerceOfferDiscount, normalizeCommerceOfferCode } from "../../logic/offer-redemption";
import type {
  CommerceCheckoutOfferPricingRepository,
  CommerceCheckoutOfferPricingRequest,
} from "../../logic/checkout-offer-pricing-repository";

type PlanType = "PERPETUAL" | "MONTHLY" | "ANNUAL";
type OfferStatus = "DRAFT" | "ACTIVE" | "DISABLED" | "REVOKED" | "EXPIRED";
type RedemptionStatus = "RESERVED" | "APPLIED" | "RELEASED" | "REFUNDED";

interface OrderRow {
  id: string;
  accountId: string;
  status: "PENDING" | "PAID" | "CANCELLED" | "REFUNDED" | "PARTIALLY_REFUNDED";
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
}

interface InvoiceRow {
  id: string;
  status: "DRAFT" | "FINAL" | "VOID";
  subtotalMinor: number;
  totalMinor: number;
}

interface ItemRow {
  id: string;
  productId: string;
  editionId: string | null;
  purchasePlanId: string | null;
  planType: PlanType | null;
  quantity: number;
  unitAmountMinor: number;
  totalMinor: number;
  catalogAmountMinor: number | null;
  pricingVersion: string | null;
  pricingSnapshot: unknown;
}

interface OfferRow {
  id: string;
  codeNormalized: string | null;
  name: string;
  type: CommerceCheckoutOfferType;
  status: OfferStatus;
  discountBps: number;
  startsAt: Date;
  endsAt: Date | null;
  productId: string | null;
  editionId: string | null;
  purchasePlanId: string | null;
  customerAccountId: string | null;
  maximumRedemptions: number | null;
  perAccountRedemptionLimit: number | null;
  discountedBillingCycles: number | null;
  allowZeroTotal: boolean;
  revokedAt: Date | null;
}

interface ExistingRedemptionRow {
  redemptionId: string;
  status: RedemptionStatus;
  offerId: string;
  discountBps: number;
  discountMinor: number;
  finalMinor: number;
  discountedBillingCycles: number | null;
  name: string;
  codeNormalized: string | null;
  type: CommerceCheckoutOfferType;
  productId: string | null;
  editionId: string | null;
  purchasePlanId: string | null;
  customerAccountId: string | null;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function scopeFor(offer: Pick<OfferRow, "purchasePlanId" | "editionId" | "productId" | "customerAccountId">): CommerceCheckoutOfferScope {
  if (offer.purchasePlanId) return "PURCHASE_PLAN";
  if (offer.editionId) return "EDITION";
  if (offer.productId) return "PRODUCT";
  if (offer.customerAccountId) return "CUSTOMER_ACCOUNT";
  return "ALL_ELIGIBLE";
}

function offerMatches(
  offer: OfferRow,
  order: OrderRow,
  item: ItemRow,
  now: Date,
): CommercePriceCheckoutOfferResult["status"] | string | null {
  if (offer.status !== "ACTIVE" || offer.revokedAt !== null) return "OFFER_INACTIVE";
  if (offer.startsAt.getTime() > now.getTime()) return "OFFER_NOT_STARTED";
  if (offer.endsAt !== null && offer.endsAt.getTime() <= now.getTime()) return "OFFER_EXPIRED";
  if (
    (offer.customerAccountId !== null && offer.customerAccountId !== order.accountId) ||
    (offer.productId !== null && offer.productId !== item.productId) ||
    (offer.editionId !== null && offer.editionId !== item.editionId) ||
    (offer.purchasePlanId !== null && offer.purchasePlanId !== item.purchasePlanId) ||
    (offer.discountedBillingCycles !== null && item.planType !== "MONTHLY")
  ) {
    return "OFFER_SCOPE_MISMATCH";
  }
  return null;
}

function offerSnapshot(
  offer: OfferRow,
  redemptionId: string,
  discountMinor: number,
  finalMinor: number,
): CommerceCheckoutOfferSnapshot {
  return Object.freeze({
    redemptionId,
    offerId: offer.id,
    name: offer.name,
    code: offer.codeNormalized,
    type: offer.type,
    scope: scopeFor(offer),
    discountBps: offer.discountBps,
    discountMinor,
    finalMinor,
    discountedBillingCycles: offer.discountedBillingCycles,
  });
}

function existingSnapshot(row: ExistingRedemptionRow): CommerceCheckoutOfferSnapshot {
  return Object.freeze({
    redemptionId: row.redemptionId,
    offerId: row.offerId,
    name: row.name,
    code: row.codeNormalized,
    type: row.type,
    scope: scopeFor(row),
    discountBps: row.discountBps,
    discountMinor: row.discountMinor,
    finalMinor: row.finalMinor,
    discountedBillingCycles: row.discountedBillingCycles,
  });
}

function eligibleForOffer(order: OrderRow, item: ItemRow | undefined): item is ItemRow {
  return Boolean(
    item &&
      order.status === "PENDING" &&
      order.taxMinor === 0 &&
      item.quantity === 1 &&
      item.catalogAmountMinor !== null &&
      Number.isSafeInteger(Number(item.catalogAmountMinor)) &&
      Number(item.catalogAmountMinor) >= 0 &&
      item.planType !== null &&
      item.pricingVersion?.trim() &&
      Number(order.subtotalMinor) === Number(item.catalogAmountMinor) &&
      Number(order.totalMinor) === Number(item.catalogAmountMinor) &&
      Number(item.unitAmountMinor) === Number(item.catalogAmountMinor) &&
      Number(item.totalMinor) === Number(item.catalogAmountMinor),
  );
}

const offerColumns = `"id", "codeNormalized", "name", "type", "status", "discountBps", "startsAt", "endsAt",
  "productId", "editionId", "purchasePlanId", "customerAccountId", "maximumRedemptions",
  "perAccountRedemptionLimit", "discountedBillingCycles", "allowZeroTotal", "revokedAt"`;

export function createPostgresCommerceCheckoutOfferPricingRepository(
  connectionString: string,
): CommerceCheckoutOfferPricingRepository {
  const normalized = connectionString.trim();
  if (!normalized) throw new Error("Commerce PostgreSQL connection string is required.");

  return Object.freeze({
    async price(input: CommerceCheckoutOfferPricingRequest): Promise<CommercePriceCheckoutOfferResult> {
      const client = new Client({ connectionString: normalized });
      await client.connect();
      try {
        await client.query("BEGIN");

        const orderResult = await client.query<OrderRow>(
          `SELECT "id", "accountId", "status", "currency", "subtotalMinor", "taxMinor", "totalMinor"
             FROM "Order"
            WHERE "id" = $1
            FOR UPDATE`,
          [input.orderId],
        );
        if (orderResult.rowCount !== 1) {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "ORDER_NOT_FOUND" };
        }
        const order = orderResult.rows[0]!;

        const invoiceResult = await client.query<InvoiceRow>(
          `SELECT "id", "status", "subtotalMinor", "totalMinor"
             FROM "Invoice"
            WHERE "orderId" = $1
            FOR UPDATE`,
          [order.id],
        );
        if (invoiceResult.rowCount !== 1) throw new Error("Commerce invoice is missing for checkout offer pricing.");
        const invoice = invoiceResult.rows[0]!;

        const itemsResult = await client.query<ItemRow>(
          `SELECT "id", "productId", "editionId", "purchasePlanId", "planType", "quantity",
                  "unitAmountMinor", "totalMinor", "catalogAmountMinor", "pricingVersion", "pricingSnapshot"
             FROM "OrderItem"
            WHERE "orderId" = $1
            ORDER BY "id"`,
          [order.id],
        );
        const item = itemsResult.rows.length === 1 ? itemsResult.rows[0] : undefined;

        const existingResult = await client.query<ExistingRedemptionRow>(
          `SELECT r."id" AS "redemptionId", r."status", r."offerId", r."discountBps", r."discountMinor",
                  r."finalMinor", r."discountedBillingCycles", o."name", o."codeNormalized", o."type",
                  o."productId", o."editionId", o."purchasePlanId", o."customerAccountId"
             FROM "OfferRedemption" r
             JOIN "DiscountOffer" o ON o."id" = r."offerId"
            WHERE r."orderId" = $1
            LIMIT 1
            FOR UPDATE OF r`,
          [order.id],
        );
        const existing = existingResult.rows[0];
        if (existing) {
          if (existing.status !== "RESERVED" && existing.status !== "APPLIED") {
            await client.query("ROLLBACK");
            return { status: "REJECTED", code: "ORDER_NOT_ELIGIBLE" };
          }
          await client.query("COMMIT");
          return {
            status: "PRICED",
            value: {
              orderId: order.id,
              subtotalMinor: Number(order.subtotalMinor),
              totalMinor: Number(order.totalMinor),
              offer: existingSnapshot(existing),
            },
          };
        }

        if (invoice.status !== "DRAFT" || !eligibleForOffer(order, item)) {
          if (input.offerIdentifier === null) {
            await client.query("COMMIT");
            return {
              status: "PRICED",
              value: {
                orderId: order.id,
                subtotalMinor: Number(order.subtotalMinor),
                totalMinor: Number(order.totalMinor),
                offer: null,
              },
            };
          }
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "ORDER_NOT_ELIGIBLE" };
        }

        let offer: OfferRow | undefined;
        if (input.offerIdentifier !== null) {
          const normalizedIdentifier = normalizeCommerceOfferCode(input.offerIdentifier);
          const offerResult = await client.query<OfferRow>(
            `SELECT ${offerColumns}
               FROM "DiscountOffer"
              WHERE "id" = $1 OR "codeNormalized" = $2
              ORDER BY CASE WHEN "id" = $1 THEN 0 ELSE 1 END
              LIMIT 1
              FOR UPDATE`,
            [input.offerIdentifier, normalizedIdentifier],
          );
          offer = offerResult.rows[0];
          if (!offer) {
            await client.query("ROLLBACK");
            return { status: "REJECTED", code: "OFFER_NOT_FOUND" };
          }
          const mismatch = offerMatches(offer, order, item, input.now);
          if (mismatch) {
            await client.query("ROLLBACK");
            return { status: "REJECTED", code: mismatch as Exclude<CommercePriceCheckoutOfferResult, { status: "PRICED" } | { status: "FAILED" }>["code"] };
          }
        } else {
          const publicResult = await client.query<OfferRow>(
            `SELECT ${offerColumns}
               FROM "DiscountOffer"
              WHERE "type" = 'GENERAL_PROMOTION'
                AND "status" = 'ACTIVE'
                AND "codeNormalized" IS NULL
                AND "customerAccountId" IS NULL
                AND "revokedAt" IS NULL
                AND "startsAt" <= $1
                AND ("endsAt" IS NULL OR "endsAt" > $1)
                AND ("productId" IS NULL OR "productId" = $2)
                AND ("editionId" IS NULL OR "editionId" = $3)
                AND ("purchasePlanId" IS NULL OR "purchasePlanId" = $4)
                AND ("discountedBillingCycles" IS NULL OR $5 = 'MONTHLY')
              ORDER BY "discountBps" DESC, "createdAt" ASC
              LIMIT 1
              FOR UPDATE`,
            [input.now, item.productId, item.editionId, item.purchasePlanId, item.planType],
          );
          offer = publicResult.rows[0];
          if (!offer) {
            await client.query("COMMIT");
            return {
              status: "PRICED",
              value: {
                orderId: order.id,
                subtotalMinor: Number(order.subtotalMinor),
                totalMinor: Number(order.totalMinor),
                offer: null,
              },
            };
          }
        }

        const counts = await client.query<{ total: string; account: string }>(
          `SELECT COUNT(*) FILTER (WHERE "status" IN ('RESERVED','APPLIED','REFUNDED'))::text AS "total",
                  COUNT(*) FILTER (WHERE "status" IN ('RESERVED','APPLIED','REFUNDED') AND "accountId" = $2)::text AS "account"
             FROM "OfferRedemption"
            WHERE "offerId" = $1`,
          [offer.id, order.accountId],
        );
        const totalCount = Number.parseInt(counts.rows[0]?.total ?? "0", 10);
        const accountCount = Number.parseInt(counts.rows[0]?.account ?? "0", 10);
        if (offer.maximumRedemptions !== null && totalCount >= offer.maximumRedemptions) {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "GLOBAL_LIMIT_REACHED" };
        }
        if (offer.perAccountRedemptionLimit !== null && accountCount >= offer.perAccountRedemptionLimit) {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "ACCOUNT_LIMIT_REACHED" };
        }

        const baseMinor = Number(item.catalogAmountMinor);
        const discount = calculateCommerceOfferDiscount({ baseMinor, discountBps: offer.discountBps });
        if (
          discount.finalMinor === 0 &&
          baseMinor > 0 &&
          (!offer.allowZeroTotal || (item.planType === "PERPETUAL" && offer.type === "GENERAL_PROMOTION"))
        ) {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "ZERO_TOTAL_NOT_ALLOWED" };
        }

        const redemptionId = randomUUID();
        await client.query(
          `INSERT INTO "OfferRedemption" (
             "id", "offerId", "accountId", "orderId", "status", "discountBps",
             "discountedBillingCycles", "baseMinor", "discountMinor", "finalMinor", "currency",
             "pricingVersion", "reservedAt"
           ) VALUES ($1, $2, $3, $4, 'RESERVED', $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            redemptionId,
            offer.id,
            order.accountId,
            order.id,
            offer.discountBps,
            offer.discountedBillingCycles,
            baseMinor,
            discount.discountMinor,
            discount.finalMinor,
            order.currency,
            item.pricingVersion,
            input.now,
          ],
        );

        const snapshot = offerSnapshot(offer, redemptionId, discount.discountMinor, discount.finalMinor);
        const pricingSnapshot = {
          ...record(item.pricingSnapshot),
          finalAmountMinor: discount.finalMinor,
          offer: {
            id: snapshot.offerId,
            name: snapshot.name,
            code: snapshot.code,
            type: snapshot.type,
            scope: snapshot.scope,
            discountBps: snapshot.discountBps,
            discountAmountMinor: snapshot.discountMinor,
            discountedBillingCycles: snapshot.discountedBillingCycles,
          },
        };

        await client.query(
          `UPDATE "Order"
              SET "subtotalMinor" = $2,
                  "totalMinor" = $2
            WHERE "id" = $1`,
          [order.id, discount.finalMinor],
        );
        await client.query(
          `UPDATE "OrderItem"
              SET "unitAmountMinor" = $2,
                  "totalMinor" = $2,
                  "offerId" = $3,
                  "offerDiscountBps" = $4,
                  "offerDiscountMinor" = $5,
                  "pricingSnapshot" = $6::jsonb
            WHERE "id" = $1`,
          [item.id, discount.finalMinor, offer.id, offer.discountBps, discount.discountMinor, JSON.stringify(pricingSnapshot)],
        );
        await client.query(
          `UPDATE "Invoice" SET "totalMinor" = $2 WHERE "id" = $1`,
          [invoice.id, discount.finalMinor],
        );
        if (discount.discountMinor > 0) {
          const codeSuffix = offer.codeNormalized ? ` — code ${offer.codeNormalized}` : "";
          const description = `Promotional discount — ${offer.name}${codeSuffix} (${(offer.discountBps / 100).toFixed(2)}%)`;
          await client.query(
            `INSERT INTO "InvoiceLine" ("id", "invoiceId", "description", "quantity", "unitAmountMinor", "totalMinor")
             VALUES ($1, $2, $3, 1, $4, $4)`,
            [randomUUID(), invoice.id, description, -discount.discountMinor],
          );
        }

        await client.query("COMMIT");
        return {
          status: "PRICED",
          value: {
            orderId: order.id,
            subtotalMinor: discount.finalMinor,
            totalMinor: discount.finalMinor,
            offer: snapshot,
          },
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

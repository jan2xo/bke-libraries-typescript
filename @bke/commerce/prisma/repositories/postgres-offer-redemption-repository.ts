import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type {
  CommerceOfferRedemptionSnapshot,
  CommerceOfferRedemptionTransition,
  CommerceReserveOfferRedemptionResult,
  CommerceTransitionOfferRedemptionResult,
} from "../../contracts/offer-redemption.contract";
import { calculateCommerceOfferDiscount, isCommerceOfferRedemptionTransitionAllowed } from "../../logic/offer-redemption";
import type {
  CommerceOfferRedemptionRepository,
  CommerceOfferReservationRequest,
} from "../../logic/offer-redemption-repository";

interface OfferRow {
  id: string;
  status: "DRAFT" | "ACTIVE" | "DISABLED" | "REVOKED" | "EXPIRED";
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
}

interface RedemptionRow {
  id: string;
  offerId: string;
  accountId: string;
  orderId: string;
  status: "RESERVED" | "APPLIED" | "RELEASED" | "REFUNDED";
  discountBps: number;
  discountedBillingCycles: number | null;
  baseMinor: number;
  discountMinor: number;
  finalMinor: number;
  currency: string;
  pricingVersion: string;
  reservedAt: Date;
  appliedAt: Date | null;
  releasedAt: Date | null;
}

function mapRedemption(row: RedemptionRow): CommerceOfferRedemptionSnapshot {
  return {
    id: row.id,
    offerId: row.offerId,
    accountId: row.accountId,
    orderId: row.orderId,
    status: row.status,
    discountBps: row.discountBps,
    discountedBillingCycles: row.discountedBillingCycles,
    baseMinor: row.baseMinor,
    discountMinor: row.discountMinor,
    finalMinor: row.finalMinor,
    currency: row.currency,
    pricingVersion: row.pricingVersion,
    reservedAt: row.reservedAt,
    appliedAt: row.appliedAt,
    releasedAt: row.releasedAt,
  };
}

function scopeMatches(expected: string | null, actual: string | null | undefined): boolean {
  return expected === null || expected === (actual ?? null);
}

const redemptionColumns = `"id", "offerId", "accountId", "orderId", "status", "discountBps",
  "discountedBillingCycles", "baseMinor", "discountMinor", "finalMinor", "currency",
  "pricingVersion", "reservedAt", "appliedAt", "releasedAt"`;

export function createPostgresCommerceOfferRedemptionRepository(
  connectionString: string,
): CommerceOfferRedemptionRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Commerce PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async reserve(input: CommerceOfferReservationRequest): Promise<CommerceReserveOfferRedemptionResult> {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        await client.query("BEGIN");

        const existing = await client.query<RedemptionRow>(
          `SELECT ${redemptionColumns} FROM "OfferRedemption" WHERE "orderId" = $1 LIMIT 1`,
          [input.orderId],
        );
        if (existing.rows[0]) {
          await client.query("COMMIT");
          return { status: "RESERVED", redemption: mapRedemption(existing.rows[0]), idempotent: true };
        }

        const offerResult = await client.query<OfferRow>(
          `SELECT "id", "status", "discountBps", "startsAt", "endsAt", "productId", "editionId",
                  "purchasePlanId", "customerAccountId", "maximumRedemptions",
                  "perAccountRedemptionLimit", "discountedBillingCycles", "allowZeroTotal"
             FROM "DiscountOffer"
            WHERE "codeNormalized" = $1
            LIMIT 1
            FOR UPDATE`,
          [input.codeNormalized],
        );
        const offer = offerResult.rows[0];
        if (!offer) {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "OFFER_NOT_FOUND" };
        }
        if (offer.status !== "ACTIVE") {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "OFFER_INACTIVE" };
        }
        if (offer.startsAt.getTime() > input.now.getTime()) {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "OFFER_NOT_STARTED" };
        }
        if (offer.endsAt !== null && offer.endsAt.getTime() <= input.now.getTime()) {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "OFFER_EXPIRED" };
        }
        if (
          !scopeMatches(offer.productId, input.productId) ||
          !scopeMatches(offer.editionId, input.editionId) ||
          !scopeMatches(offer.purchasePlanId, input.purchasePlanId) ||
          !scopeMatches(offer.customerAccountId, input.accountId)
        ) {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "OFFER_SCOPE_MISMATCH" };
        }

        const counts = await client.query<{ total: string; account: string }>(
          `SELECT COUNT(*) FILTER (WHERE "status" <> 'RELEASED')::text AS "total",
                  COUNT(*) FILTER (WHERE "status" <> 'RELEASED' AND "accountId" = $2)::text AS "account"
             FROM "OfferRedemption"
            WHERE "offerId" = $1`,
          [offer.id, input.accountId],
        );
        const totalCount = Number.parseInt(counts.rows[0]?.total ?? "0", 10);
        const accountCount = Number.parseInt(counts.rows[0]?.account ?? "0", 10);
        if (offer.maximumRedemptions !== null && totalCount >= offer.maximumRedemptions) {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "GLOBAL_LIMIT_REACHED" };
        }
        if (
          offer.perAccountRedemptionLimit !== null &&
          accountCount >= offer.perAccountRedemptionLimit
        ) {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "ACCOUNT_LIMIT_REACHED" };
        }

        const price = calculateCommerceOfferDiscount({
          baseMinor: input.baseMinor,
          discountBps: offer.discountBps,
        });
        if (price.finalMinor === 0 && input.baseMinor > 0 && !offer.allowZeroTotal) {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "ZERO_TOTAL_NOT_ALLOWED" };
        }

        const inserted = await client.query<RedemptionRow>(
          `INSERT INTO "OfferRedemption" (
             "id", "offerId", "accountId", "orderId", "status", "discountBps",
             "discountedBillingCycles", "baseMinor", "discountMinor", "finalMinor", "currency",
             "pricingVersion", "reservedAt"
           ) VALUES ($1, $2, $3, $4, 'RESERVED', $5, $6, $7, $8, $9, $10, $11, $12)
           RETURNING ${redemptionColumns}`,
          [
            randomUUID(),
            offer.id,
            input.accountId,
            input.orderId,
            offer.discountBps,
            offer.discountedBillingCycles,
            input.baseMinor,
            price.discountMinor,
            price.finalMinor,
            input.currency,
            input.pricingVersion,
            input.now,
          ],
        );
        await client.query("COMMIT");
        return { status: "RESERVED", redemption: mapRedemption(inserted.rows[0]!), idempotent: false };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        await client.end();
      }
    },

    async transition(input: {
      readonly redemptionId: string;
      readonly transition: CommerceOfferRedemptionTransition;
      readonly now: Date;
    }): Promise<CommerceTransitionOfferRedemptionResult> {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        await client.query("BEGIN");
        const currentResult = await client.query<RedemptionRow>(
          `SELECT ${redemptionColumns} FROM "OfferRedemption" WHERE "id" = $1 LIMIT 1 FOR UPDATE`,
          [input.redemptionId],
        );
        const current = currentResult.rows[0];
        if (!current) {
          await client.query("ROLLBACK");
          return { status: "NOT_FOUND" };
        }
        if (!isCommerceOfferRedemptionTransitionAllowed(current.status, input.transition)) {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "INVALID_TRANSITION" };
        }

        const nextStatus: RedemptionRow["status"] =
          input.transition === "APPLY"
            ? "APPLIED"
            : input.transition === "RELEASE"
              ? "RELEASED"
              : "REFUNDED";
        const appliedAt = input.transition === "APPLY" ? input.now : null;
        const releasedAt = input.transition === "RELEASE" ? input.now : null;
        const updated = await client.query<RedemptionRow>(
          `UPDATE "OfferRedemption"
              SET "status" = $2::"CommerceOfferRedemptionStatus",
                  "appliedAt" = COALESCE($3, "appliedAt"),
                  "releasedAt" = COALESCE($4, "releasedAt")
            WHERE "id" = $1
            RETURNING ${redemptionColumns}`,
          [input.redemptionId, nextStatus, appliedAt, releasedAt],
        );
        await client.query("COMMIT");
        return { status: "UPDATED", redemption: mapRedemption(updated.rows[0]!) };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        await client.end();
      }
    },
  });
}

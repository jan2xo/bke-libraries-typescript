import { randomUUID } from "node:crypto";
import { Client, type PoolClient } from "pg";
import type { CommerceSubscriptionLifecycleSnapshot } from "../../contracts/subscription-lifecycle-management.contract";
import {
  commerceSubscriptionPeriod,
  type CommerceSubscriptionLifecycleRepository,
} from "../../logic/subscription-lifecycle-management";

type StartInput = Parameters<CommerceSubscriptionLifecycleRepository["start"]>[0];
type RenewInput = Parameters<CommerceSubscriptionLifecycleRepository["renew"]>[0];

interface SubscriptionRow {
  id: string;
  accountId: string;
  orderId: string;
  productId: string;
  editionId: string | null;
  purchasePlanId: string | null;
  status: "PENDING" | "ACTIVE" | "PAST_DUE" | "EXPIRED" | "CANCELLED";
  seats: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  renewalReminderAt: Date;
  currency: string | null;
  normalRecurringAmountMinor: number | null;
  discountedRecurringAmountMinor: number | null;
  promotionalDiscountBps: number | null;
  discountedCyclesTotal: number | null;
  discountedCyclesConsumed: number;
  offerId: string | null;
  pricingVersion: string | null;
}

const columns = `
  "id", "accountId", "orderId", "productId", "editionId", "purchasePlanId",
  "status", "seats", "currentPeriodStart", "currentPeriodEnd", "renewalReminderAt",
  "currency", "normalRecurringAmountMinor", "discountedRecurringAmountMinor",
  "promotionalDiscountBps", "discountedCyclesTotal", "discountedCyclesConsumed",
  "offerId", "pricingVersion"`;

function mapSubscription(row: SubscriptionRow): CommerceSubscriptionLifecycleSnapshot {
  return {
    id: row.id,
    accountId: row.accountId,
    orderId: row.orderId,
    productId: row.productId,
    editionId: row.editionId,
    purchasePlanId: row.purchasePlanId,
    status: "ACTIVE",
    seats: row.seats,
    currentPeriodStart: row.currentPeriodStart,
    currentPeriodEnd: row.currentPeriodEnd,
    renewalReminderAt: row.renewalReminderAt,
    currency: row.currency,
    normalRecurringAmountMinor: row.normalRecurringAmountMinor,
    discountedRecurringAmountMinor: row.discountedRecurringAmountMinor,
    promotionalDiscountBps: row.promotionalDiscountBps,
    discountedCyclesTotal: row.discountedCyclesTotal,
    discountedCyclesConsumed: row.discountedCyclesConsumed,
    offerId: row.offerId,
    pricingVersion: row.pricingVersion,
  };
}

async function lockSubscription(client: PoolClient, subscriptionId: string): Promise<SubscriptionRow | null> {
  const result = await client.query<SubscriptionRow>(
    `SELECT ${columns} FROM "Subscription" WHERE "id" = $1 FOR UPDATE`,
    [subscriptionId],
  );
  return result.rows[0] ?? null;
}

export function createPostgresCommerceSubscriptionLifecycleRepository(
  connectionString: string,
): CommerceSubscriptionLifecycleRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) throw new Error("Commerce PostgreSQL connection string is required.");

  return Object.freeze({
    async start(input: StartInput) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        const result = await client.query<SubscriptionRow>(
          `INSERT INTO "Subscription" (
             "id", "accountId", "orderId", "productId", "editionId", "purchasePlanId",
             "status", "seats", "currentPeriodStart", "currentPeriodEnd", "renewalReminderAt",
             "currency", "normalRecurringAmountMinor", "discountedRecurringAmountMinor",
             "promotionalDiscountBps", "discountedCyclesTotal", "discountedCyclesConsumed",
             "offerId", "offerSnapshot", "pricingVersion", "updatedAt"
           ) VALUES (
             $1, $2, $3, $4, $5, $6,
             'ACTIVE', $7, $8, $9, $10,
             $11, $12, $13, $14, $15, $16,
             $17, $18::jsonb, $19, CURRENT_TIMESTAMP
           )
           RETURNING ${columns}`,
          [
            randomUUID(), input.accountId, input.orderId, input.productId, input.editionId,
            input.purchasePlanId, input.seats, input.currentPeriodStart, input.currentPeriodEnd,
            input.renewalReminderAt, input.currency, input.normalRecurringAmountMinor,
            input.discountedRecurringAmountMinor, input.promotionalDiscountBps,
            input.discountedCyclesTotal, input.discountedCyclesConsumed, input.offerId,
            JSON.stringify(input.offerSnapshot), input.pricingVersion,
          ],
        );
        return mapSubscription(result.rows[0]!);
      } finally {
        await client.end();
      }
    },

    async renew(input: RenewInput) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        await client.query("BEGIN");
        const existing = await lockSubscription(client, input.subscriptionId);
        if (!existing) {
          await client.query("ROLLBACK");
          return null;
        }

        const currentPeriodStart = existing.currentPeriodEnd.getTime() > input.now.getTime()
          ? existing.currentPeriodEnd
          : input.now;
        const period = commerceSubscriptionPeriod(currentPeriodStart, input.intervalUnit, input.intervalCount);
        const discountedCycleConsumed = Boolean(
          input.settlementOfferId
          && existing.discountedCyclesTotal
          && existing.discountedCyclesConsumed < existing.discountedCyclesTotal,
        );
        const nextConsumed = existing.discountedCyclesConsumed + (discountedCycleConsumed ? 1 : 0);

        const result = await client.query<SubscriptionRow>(
          `UPDATE "Subscription"
           SET "status" = 'ACTIVE',
               "currentPeriodStart" = $2,
               "currentPeriodEnd" = $3,
               "renewalReminderAt" = $4,
               "discountedCyclesConsumed" = $5,
               "updatedAt" = CURRENT_TIMESTAMP
           WHERE "id" = $1
           RETURNING ${columns}`,
          [
            input.subscriptionId,
            currentPeriodStart,
            period.currentPeriodEnd,
            period.renewalReminderAt,
            nextConsumed,
          ],
        );
        await client.query("COMMIT");
        return {
          subscription: mapSubscription(result.rows[0]!),
          discountedCycleConsumed,
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        await client.end();
      }
    },
  });
}

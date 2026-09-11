import { randomUUID } from "node:crypto";
import { Client, type PoolClient } from "pg";
import type { CommerceManagedPurchasePlanSnapshot } from "../../contracts/purchase-plan-management.contract";
import type { CommercePurchasePlanManagementRepository } from "../../logic/purchase-plan-management";

type PurchasePlanManagementSyncInput = Parameters<CommercePurchasePlanManagementRepository["sync"]>[0];

interface ManagedPlanRow {
  id: string;
  editionId: string;
  type: "PERPETUAL" | "MONTHLY" | "ANNUAL";
  currency: string;
  amountMinor: number | null;
  annualDiscountBps: number | null;
  renewalBehavior: "NONE" | "CUSTOMER_AUTHORIZED";
  active: boolean;
  monthlySourcePlanId: string | null;
}

function mapPlan(row: ManagedPlanRow, monthlySource?: ManagedPlanRow | null): CommerceManagedPurchasePlanSnapshot {
  return {
    id: row.id,
    editionId: row.editionId,
    type: row.type,
    currency: row.currency,
    amountMinor: row.amountMinor,
    annualDiscountBps: row.annualDiscountBps,
    renewalBehavior: row.renewalBehavior,
    active: row.active,
    monthlySource: monthlySource
      ? {
          amountMinor: monthlySource.amountMinor,
          active: monthlySource.active,
          type: monthlySource.type,
          editionId: monthlySource.editionId,
        }
      : null,
  };
}

async function upsertPlan(
  client: Client | PoolClient,
  input: {
    readonly id: string;
    readonly editionId: string;
    readonly type: "PERPETUAL" | "MONTHLY";
    readonly active: boolean;
    readonly amountMinor: number | null;
    readonly renewalBehavior: "NONE" | "CUSTOMER_AUTHORIZED";
  },
): Promise<ManagedPlanRow> {
  const result = await client.query<ManagedPlanRow>(
    `INSERT INTO "PurchasePlan" (
       "id", "editionId", "type", "currency", "amountMinor", "annualDiscountBps",
       "renewalBehavior", "active", "monthlySourcePlanId", "updatedAt"
     ) VALUES ($1, $2, $3, 'PHP', COALESCE($4, 100), NULL, $5, $6, NULL, CURRENT_TIMESTAMP)
     ON CONFLICT ("editionId", "type") DO UPDATE SET
       "amountMinor" = COALESCE(EXCLUDED."amountMinor", "PurchasePlan"."amountMinor"),
       "annualDiscountBps" = NULL,
       "renewalBehavior" = EXCLUDED."renewalBehavior",
       "active" = EXCLUDED."active",
       "monthlySourcePlanId" = NULL,
       "updatedAt" = CURRENT_TIMESTAMP
     RETURNING "id", "editionId", "type", "currency", "amountMinor", "annualDiscountBps",
               "renewalBehavior", "active", "monthlySourcePlanId"`,
    [input.id, input.editionId, input.type, input.amountMinor, input.renewalBehavior, input.active],
  );
  return result.rows[0]!;
}

export function createPostgresCommercePurchasePlanManagementRepository(
  connectionString: string,
): CommercePurchasePlanManagementRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Commerce PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async sync(input: PurchasePlanManagementSyncInput) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        await client.query("BEGIN");
        const perpetual = await upsertPlan(client, {
          id: randomUUID(),
          editionId: input.editionId,
          type: "PERPETUAL",
          active: input.perpetual.active,
          amountMinor: input.perpetual.amountMinor,
          renewalBehavior: "NONE",
        });
        const monthly = await upsertPlan(client, {
          id: randomUUID(),
          editionId: input.editionId,
          type: "MONTHLY",
          active: input.monthly.active,
          amountMinor: input.monthly.amountMinor,
          renewalBehavior: "CUSTOMER_AUTHORIZED",
        });
        const annualResult = await client.query<ManagedPlanRow>(
          `INSERT INTO "PurchasePlan" (
             "id", "editionId", "type", "currency", "amountMinor", "annualDiscountBps",
             "renewalBehavior", "active", "monthlySourcePlanId", "updatedAt"
           ) VALUES ($1, $2, 'ANNUAL', 'PHP', NULL, $3, 'CUSTOMER_AUTHORIZED', $4, $5, CURRENT_TIMESTAMP)
           ON CONFLICT ("editionId", "type") DO UPDATE SET
             "amountMinor" = NULL,
             "annualDiscountBps" = EXCLUDED."annualDiscountBps",
             "renewalBehavior" = 'CUSTOMER_AUTHORIZED',
             "active" = EXCLUDED."active",
             "monthlySourcePlanId" = EXCLUDED."monthlySourcePlanId",
             "updatedAt" = CURRENT_TIMESTAMP
           RETURNING "id", "editionId", "type", "currency", "amountMinor", "annualDiscountBps",
                     "renewalBehavior", "active", "monthlySourcePlanId"`,
          [randomUUID(), input.editionId, input.annual.discountBps, input.annual.active, monthly.id],
        );
        await client.query("COMMIT");
        const annual = annualResult.rows[0]!;
        return [mapPlan(perpetual), mapPlan(monthly), mapPlan(annual, monthly)];
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        await client.end();
      }
    },
  });
}

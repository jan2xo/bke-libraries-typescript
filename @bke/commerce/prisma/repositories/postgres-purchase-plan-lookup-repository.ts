import { Client } from "pg";
import type {
  CommerceLegacyPriceSnapshot,
  CommercePurchasePlanLookupSnapshot,
} from "../../contracts/purchase-plan-lookup.contract";
import type { CommercePurchasePlanLookupRepository } from "../../logic/purchase-plan-lookup-repository";

interface PurchasePlanRow {
  id: string;
  editionId: string;
  type: "PERPETUAL" | "MONTHLY" | "ANNUAL";
  currency: string;
  amountMinor: number | null;
  annualDiscountBps: number | null;
  renewalBehavior: "NONE" | "CUSTOMER_AUTHORIZED";
  active: boolean;
  legacyPriceId: string | null;
  monthlySourceId: string | null;
  monthlySourceAmountMinor: number | null;
  monthlySourceActive: boolean | null;
  monthlySourceType: "PERPETUAL" | "MONTHLY" | "ANNUAL" | null;
  monthlySourceEditionId: string | null;
  legacyProductId: string | null;
  legacyLicensePolicyId: string | null;
  legacyName: string | null;
  legacyAmountMinor: number | null;
  legacyCurrency: string | null;
  legacyBillingType: "ONE_TIME" | "SUBSCRIPTION" | null;
  legacyIntervalUnit: "MONTH" | "YEAR" | null;
  legacyIntervalCount: number | null;
  legacyActive: boolean | null;
}

function mapLegacyPrice(row: PurchasePlanRow): CommerceLegacyPriceSnapshot | null {
  if (
    row.legacyPriceId === null ||
    row.legacyProductId === null ||
    row.legacyLicensePolicyId === null ||
    row.legacyName === null ||
    row.legacyAmountMinor === null ||
    row.legacyCurrency === null ||
    row.legacyBillingType === null ||
    row.legacyActive === null
  ) {
    return null;
  }

  return {
    id: row.legacyPriceId,
    productId: row.legacyProductId,
    licensePolicyId: row.legacyLicensePolicyId,
    name: row.legacyName,
    amountMinor: row.legacyAmountMinor,
    currency: row.legacyCurrency,
    billingType: row.legacyBillingType,
    intervalUnit: row.legacyIntervalUnit,
    intervalCount: row.legacyIntervalCount,
    active: row.legacyActive,
  };
}

function mapPlan(row: PurchasePlanRow): CommercePurchasePlanLookupSnapshot {
  return {
    id: row.id,
    editionId: row.editionId,
    type: row.type,
    currency: row.currency,
    amountMinor: row.amountMinor,
    annualDiscountBps: row.annualDiscountBps,
    renewalBehavior: row.renewalBehavior,
    active: row.active,
    monthlySource:
      row.monthlySourceId === null ||
      row.monthlySourceActive === null ||
      row.monthlySourceType === null ||
      row.monthlySourceEditionId === null
        ? null
        : {
            amountMinor: row.monthlySourceAmountMinor,
            active: row.monthlySourceActive,
            type: row.monthlySourceType,
            editionId: row.monthlySourceEditionId,
          },
    legacyPriceId: row.legacyPriceId,
    legacyPrice: mapLegacyPrice(row),
  };
}

export function createPostgresCommercePurchasePlanLookupRepository(
  connectionString: string,
): CommercePurchasePlanLookupRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Commerce PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async findById(planId: string): Promise<CommercePurchasePlanLookupSnapshot | null> {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        const result = await client.query<PurchasePlanRow>(
          `SELECT p."id", p."editionId", p."type", p."currency", p."amountMinor",
                  p."annualDiscountBps", p."renewalBehavior", p."active", p."legacyPriceId",
                  ms."id" AS "monthlySourceId",
                  ms."amountMinor" AS "monthlySourceAmountMinor",
                  ms."active" AS "monthlySourceActive",
                  ms."type" AS "monthlySourceType",
                  ms."editionId" AS "monthlySourceEditionId",
                  lp."productId" AS "legacyProductId",
                  lp."licensePolicyId" AS "legacyLicensePolicyId",
                  lp."name" AS "legacyName",
                  lp."amountMinor" AS "legacyAmountMinor",
                  lp."currency" AS "legacyCurrency",
                  lp."billingType" AS "legacyBillingType",
                  lp."intervalUnit" AS "legacyIntervalUnit",
                  lp."intervalCount" AS "legacyIntervalCount",
                  lp."active" AS "legacyActive"
             FROM "PurchasePlan" p
             LEFT JOIN "PurchasePlan" ms ON ms."id" = p."monthlySourcePlanId"
             LEFT JOIN "Price" lp ON lp."id" = p."legacyPriceId"
            WHERE p."id" = $1
            LIMIT 1`,
          [planId],
        );
        return result.rows[0] ? mapPlan(result.rows[0]) : null;
      } finally {
        await client.end();
      }
    },
  });
}

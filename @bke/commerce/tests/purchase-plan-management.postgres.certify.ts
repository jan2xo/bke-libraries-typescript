import { Client } from "pg";
import { createCommercePurchasePlanManagementCapability } from "../logic/purchase-plan-management";
import { createPostgresCommercePurchasePlanManagementRepository } from "../prisma/repositories/postgres-purchase-plan-management-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Commerce purchase-plan management certification.");

const capability = createCommercePurchasePlanManagementCapability(
  createPostgresCommercePurchasePlanManagementRepository(connectionString),
);

const first = await capability.sync({
  editionId: "opaque-edition-management",
  perpetual: { enabled: true, amountMinor: 300_000 },
  monthly: { enabled: true, amountMinor: 25_000 },
  annual: { enabled: true, discountBps: 500 },
});
if (first.status !== "OK") throw new Error(`Initial management failed: ${JSON.stringify(first)}`);

const monthly = first.plans.find((plan) => plan.type === "MONTHLY");
const annual = first.plans.find((plan) => plan.type === "ANNUAL");
if (!monthly || !annual || annual.monthlySource?.editionId !== "opaque-edition-management") {
  throw new Error(`Annual plan was not bound to the managed monthly source: ${JSON.stringify(first)}`);
}
if (annual.annualDiscountBps !== 500 || annual.renewalBehavior !== "CUSTOMER_AUTHORIZED") {
  throw new Error(`Annual semantics mismatch: ${JSON.stringify(annual)}`);
}

const second = await capability.sync({
  editionId: "opaque-edition-management",
  perpetual: { enabled: false },
  monthly: { enabled: true, amountMinor: 30_000 },
  annual: { enabled: false },
});
if (second.status !== "OK") throw new Error(`Update management failed: ${JSON.stringify(second)}`);

const client = new Client({ connectionString });
await client.connect();
try {
  const rows = await client.query<{
    type: "PERPETUAL" | "MONTHLY" | "ANNUAL";
    amountMinor: number | null;
    annualDiscountBps: number | null;
    renewalBehavior: "NONE" | "CUSTOMER_AUTHORIZED";
    active: boolean;
    monthlySourcePlanId: string | null;
  }>(
    `SELECT "type", "amountMinor", "annualDiscountBps", "renewalBehavior", "active", "monthlySourcePlanId"
       FROM "PurchasePlan"
      WHERE "editionId" = $1
      ORDER BY "type"`,
    ["opaque-edition-management"],
  );
  const byType = new Map(rows.rows.map((row) => [row.type, row]));
  const perpetual = byType.get("PERPETUAL");
  const updatedMonthly = byType.get("MONTHLY");
  const updatedAnnual = byType.get("ANNUAL");
  if (!perpetual || perpetual.active || perpetual.amountMinor !== 300_000 || perpetual.renewalBehavior !== "NONE") {
    throw new Error(`Disabled perpetual plan did not preserve prior amount: ${JSON.stringify(perpetual)}`);
  }
  if (!updatedMonthly || !updatedMonthly.active || updatedMonthly.amountMinor !== 30_000 || updatedMonthly.renewalBehavior !== "CUSTOMER_AUTHORIZED") {
    throw new Error(`Monthly update mismatch: ${JSON.stringify(updatedMonthly)}`);
  }
  if (!updatedAnnual || updatedAnnual.active || updatedAnnual.amountMinor !== null || updatedAnnual.annualDiscountBps !== 0 || !updatedAnnual.monthlySourcePlanId) {
    throw new Error(`Annual disable/source semantics mismatch: ${JSON.stringify(updatedAnnual)}`);
  }
} finally {
  await client.end();
}

console.log("Commerce PurchasePlan management PostgreSQL semantics GREEN");

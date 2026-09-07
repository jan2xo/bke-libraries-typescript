import { Client } from "pg";
import type { LicensingGraceMutationEffect } from "../logic/grace-period-ports";
import { createLicensingGracePeriodCapability } from "../logic/grace-period";
import { createPostgresLicensingGracePeriodStore } from "../prisma/repositories/postgres-grace-period-store";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Licensing grace-period certification.");

const reset = new Client({ connectionString });
await reset.connect();
try {
  await reset.query('DELETE FROM "ProductGraceOverride"');
} finally {
  await reset.end();
}

const observed: unknown[] = [];
const effect: LicensingGraceMutationEffect = Object.freeze({
  async record(mutation, transaction) {
    await transaction.execute("SELECT 1");
    observed.push(mutation);
  },
});
const capability = createLicensingGracePeriodCapability({
  store: createPostgresLicensingGracePeriodStore(connectionString),
  mutationEffect: effect,
});

if (await capability.readState("airstack")) throw new Error("Missing Grace override must read false.");
const firstOld = await capability.setState({ productKey: "airstack", graceEnabled: true, operationSource: "VPS_CLI" });
if (firstOld !== false || !(await capability.readState("airstack"))) throw new Error("Grace enable parity failed.");
const secondOld = await capability.setState({ productKey: "airstack", graceEnabled: false, operationSource: "VPS_CLI" });
if (secondOld !== true || (await capability.readState("airstack"))) throw new Error("Grace disable parity failed.");
const statuses = await capability.readStatuses();
if (statuses.airstack !== false || statuses.renderdock !== false) throw new Error("Grace status defaults drifted.");
if (observed.length !== 2) throw new Error("Grace mutation effect was not invoked exactly once per committed override.");

const failing = createLicensingGracePeriodCapability({
  store: createPostgresLicensingGracePeriodStore(connectionString),
  mutationEffect: Object.freeze({ async record() { throw new Error("forced audit failure"); } }),
});
let failed = false;
try {
  await failing.setState({ productKey: "renderdock", graceEnabled: true, operationSource: "VPS_CLI" });
} catch (error) {
  failed = error instanceof Error && error.message === "forced audit failure";
}
if (!failed) throw new Error("Grace mutation effect failure was not propagated.");
if (await capability.readState("renderdock")) throw new Error("Grace state committed despite mutation-effect failure.");

console.log("Licensing grace-period PostgreSQL certification GREEN: parity, old-value return, and atomic effect rollback proven");

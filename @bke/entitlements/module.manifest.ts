import { ENTITLEMENTS_DURABLE_RIGHT_GRANT_CAPABILITY_ID } from "./contracts/durable-right-grant.contract";
import type { EntitlementsModuleManifest } from "./contracts/module.contract";

export const entitlementsModuleManifest = Object.freeze({
  moduleId: "entitlements",
  needs: [],
  provides: [ENTITLEMENTS_DURABLE_RIGHT_GRANT_CAPABILITY_ID],
} as const satisfies EntitlementsModuleManifest);

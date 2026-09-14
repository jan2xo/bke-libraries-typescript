import { describe, expect, it } from "vitest";
import { LICENSING_ENTITLEMENT_MANAGEMENT_CAPABILITY_ID } from "../contracts/entitlement-management.contract";
import { licensingModuleManifest } from "../module.manifest";

describe("Licensing entitlement management manifest", () => {
  it("publishes the entitlement management capability from the Licensing module", () => {
    expect(LICENSING_ENTITLEMENT_MANAGEMENT_CAPABILITY_ID).toBe(
      "bke.licensing.entitlement-management.v1",
    );
    expect(licensingModuleManifest.provides).toContain(
      LICENSING_ENTITLEMENT_MANAGEMENT_CAPABILITY_ID,
    );
  });
});

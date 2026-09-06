import { LICENSING_COMMERCIAL_LEASE_CAPABILITY_ID } from "./contracts/commercial-lease.contract";
import { LICENSING_LICENSE_KEY_REVEAL_CAPABILITY_ID } from "./contracts/license-key-reveal.contract";
import { LICENSING_TRANSFER_POLICY_CAPABILITY_ID } from "./contracts/transfer-policy.contract";
import { LICENSING_SIGNING_KEY_REGISTRY_CAPABILITY_ID } from "./contracts/signing-key-registry.contract";
import type { LicensingModuleManifest } from "./contracts/module.contract";

export const licensingModuleManifest = Object.freeze({
  moduleId: "bke.licensing",
  needs: [],
  provides: [
    LICENSING_LICENSE_KEY_REVEAL_CAPABILITY_ID,
    LICENSING_COMMERCIAL_LEASE_CAPABILITY_ID,
    LICENSING_TRANSFER_POLICY_CAPABILITY_ID,
    LICENSING_SIGNING_KEY_REGISTRY_CAPABILITY_ID,
  ],
} as const satisfies LicensingModuleManifest);

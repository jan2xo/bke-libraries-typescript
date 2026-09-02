import { LICENSING_LICENSE_KEY_REVEAL_CAPABILITY_ID } from "./contracts/license-key-reveal.contract";
import type { LicensingModuleManifest } from "./contracts/module.contract";

export const licensingModuleManifest = Object.freeze({
  moduleId: "bke.licensing",
  needs: [],
  provides: [LICENSING_LICENSE_KEY_REVEAL_CAPABILITY_ID],
} as const satisfies LicensingModuleManifest);

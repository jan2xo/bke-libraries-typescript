import { LEGAL_ACCEPTANCE_CAPABILITY_ID } from "./contracts/acceptance.contract";
import { LEGAL_CHECKOUT_REQUIREMENTS_CAPABILITY_ID } from "./contracts/checkout-requirements.contract";
import { LEGAL_REACCEPTANCE_STATUS_CAPABILITY_ID } from "./contracts/reacceptance-status.contract";
import type { LegalModuleManifest } from "./contracts/module.contract";

export const legalModuleManifest = Object.freeze({
  moduleId: "legal",
  needs: [],
  provides: [
    LEGAL_ACCEPTANCE_CAPABILITY_ID,
    LEGAL_CHECKOUT_REQUIREMENTS_CAPABILITY_ID,
    LEGAL_REACCEPTANCE_STATUS_CAPABILITY_ID,
  ],
} as const satisfies LegalModuleManifest);

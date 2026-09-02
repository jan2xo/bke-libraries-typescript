import { LEGAL_ACCEPTANCE_CAPABILITY_ID } from "./contracts/acceptance.contract";
import type { LegalModuleManifest } from "./contracts/module.contract";

export const legalModuleManifest = Object.freeze({
  moduleId: "legal",
  needs: [],
  provides: [LEGAL_ACCEPTANCE_CAPABILITY_ID],
} as const satisfies LegalModuleManifest);

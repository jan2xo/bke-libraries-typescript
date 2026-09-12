import { TRIAL_POLICY_CAPABILITY_ID } from "./contracts/trial-policy.contract";

export const trialsModuleManifest = Object.freeze({
  moduleId: "trials",
  needs: [],
  provides: [TRIAL_POLICY_CAPABILITY_ID],
} as const);

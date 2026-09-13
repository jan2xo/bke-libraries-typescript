import { PRIVACY_CUSTOMER_MINIMIZATION_CAPABILITY_ID } from "./contracts/customer-minimization.contract";
import { PRIVACY_REQUEST_POLICY_CAPABILITY_ID } from "./contracts/privacy-request-policy.contract";

export const privacyModuleManifest = Object.freeze({
  moduleId: "privacy",
  needs: [],
  provides: [
    PRIVACY_REQUEST_POLICY_CAPABILITY_ID,
    PRIVACY_CUSTOMER_MINIMIZATION_CAPABILITY_ID,
  ],
} as const);

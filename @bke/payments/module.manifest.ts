import { PAYMENTS_CHECKOUT_ATTEMPT_CAPABILITY_ID } from "./contracts/checkout-attempt.contract";
import type { PaymentsModuleManifest } from "./contracts/module.contract";
import { PAYMENTS_PROVIDER_EVENT_INGESTION_CAPABILITY_ID } from "./contracts/provider-event-ingestion.contract";
import { PAYMENTS_REFUND_INITIATION_CAPABILITY_ID } from "./contracts/refund-initiation.contract";
import { PAYMENTS_SETTLEMENT_FACT_CAPABILITY_ID } from "./contracts/settlement-fact.contract";

export const paymentsModuleManifest = Object.freeze({
  moduleId: "payments",
  needs: [],
  provides: [
    PAYMENTS_CHECKOUT_ATTEMPT_CAPABILITY_ID,
    PAYMENTS_PROVIDER_EVENT_INGESTION_CAPABILITY_ID,
    PAYMENTS_SETTLEMENT_FACT_CAPABILITY_ID,
    PAYMENTS_REFUND_INITIATION_CAPABILITY_ID,
  ],
} satisfies PaymentsModuleManifest);

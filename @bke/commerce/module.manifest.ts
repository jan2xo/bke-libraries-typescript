import type { CommerceModuleManifest } from "./contracts/module.contract";
import { COMMERCE_CHECKOUT_ORCHESTRATION_CAPABILITY_ID } from "./contracts/checkout-orchestration.contract";
import { COMMERCE_OFFER_REDEMPTION_CAPABILITY_ID } from "./contracts/offer-redemption.contract";
import { COMMERCE_ORDER_INVOICE_CREATION_CAPABILITY_ID } from "./contracts/order-invoice-creation.contract";
import { COMMERCE_PURCHASE_PLAN_LOOKUP_CAPABILITY_ID } from "./contracts/purchase-plan-lookup.contract";
import { COMMERCE_PURCHASE_PLAN_PRICING_CAPABILITY_ID } from "./contracts/purchase-plan-pricing.contract";
import { COMMERCE_SETTLEMENT_REACTION_CAPABILITY_ID } from "./contracts/settlement-reaction.contract";
import { COMMERCE_ZERO_PAYMENT_FULFILLMENT_CAPABILITY_ID } from "./contracts/zero-payment-fulfillment.contract";

export const commerceModuleManifest = Object.freeze({
  moduleId: "commerce",
  needs: [],
  provides: [
    COMMERCE_PURCHASE_PLAN_PRICING_CAPABILITY_ID,
    COMMERCE_PURCHASE_PLAN_LOOKUP_CAPABILITY_ID,
    COMMERCE_OFFER_REDEMPTION_CAPABILITY_ID,
    COMMERCE_ORDER_INVOICE_CREATION_CAPABILITY_ID,
    COMMERCE_CHECKOUT_ORCHESTRATION_CAPABILITY_ID,
    COMMERCE_SETTLEMENT_REACTION_CAPABILITY_ID,
    COMMERCE_ZERO_PAYMENT_FULFILLMENT_CAPABILITY_ID,
  ],
} as const satisfies CommerceModuleManifest);

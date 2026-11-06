import type { CommerceCheckoutOfferSnapshot } from "./checkout-offer-pricing.contract";
import type { CommerceCreateOrderInvoiceInput, CommerceOrderInvoiceSnapshot } from "./order-invoice-creation.contract";
import type { CommerceZeroPaymentFulfillmentSnapshot } from "./zero-payment-fulfillment.contract";
import type { CommerceCheckoutLegalRequirementInput } from "./checkout-orchestration.contract";

export const COMMERCE_PAYMENT_INTENT_CHECKOUT_CAPABILITY_ID =
  "bke.commerce.payment-intent-checkout.v1" as const;

export type CommercePaymentIntentLifecycle =
  | "awaiting_payment_method"
  | "awaiting_next_action"
  | "processing"
  | "succeeded"
  | "cancelled";

export interface CommerceCheckoutPaymentIntentSnapshot {
  readonly attemptId: string;
  readonly sourceReference: string;
  readonly provider: string;
  readonly paymentIntentId: string;
  readonly clientKey: string;
  readonly status: CommercePaymentIntentLifecycle;
  readonly amountMinor: number;
  readonly currency: string;
  readonly livemode: boolean;
  readonly createdAt: Date;
  readonly qrImageUrl?: string;
  readonly redirectUrl?: string;
  readonly expiresAt?: Date;
}

/**
 * Starts a new Commerce order and its Payment Intent in one pass. This capability is intentionally one-shot: it does not resume an existing order after a prior Payment Intent request is in progress or uncertain. Hosts must resolve the canonical order by source and resume through Payments separately.
 */
export interface CommerceStartPaymentIntentCheckoutInput {
  readonly principalId: string;
  readonly accountId: string;
  readonly legal: readonly CommerceCheckoutLegalRequirementInput[];
  readonly order: CommerceCreateOrderInvoiceInput;
  readonly offerIdentifier?: string | null;
  readonly paymentSourceReference: string;
}

export interface CommercePaymentIntentCheckoutPolicy {
  /** Expected provider identity set by the host from trusted server configuration. */
  readonly providerName: string;
  /** Set by the host from trusted server configuration, never by checkout input. */
  readonly livemode: boolean;
  /** Explicit provider methods enabled by the host, never supplied by checkout input. */
  readonly paymentMethodAllowed: readonly string[];
}

export type CommerceStartPaymentIntentCheckoutResult =
  | {
      readonly status: "PAYMENT_INTENT_READY";
      readonly order: CommerceOrderInvoiceSnapshot;
      readonly paymentIntent: CommerceCheckoutPaymentIntentSnapshot;
      readonly offer: CommerceCheckoutOfferSnapshot | null;
    }
  | {
      readonly status: "PAYMENT_NOT_REQUIRED";
      readonly order: CommerceOrderInvoiceSnapshot;
      readonly fulfillment: CommerceZeroPaymentFulfillmentSnapshot;
      readonly offer: CommerceCheckoutOfferSnapshot | null;
    }
  | {
      readonly status: "REJECTED";
      readonly code:
        | "ACCOUNT_FORBIDDEN"
        | "LEGAL_NOT_ACCEPTED"
        | "ORDER_CONFLICT"
        | "OFFER_NOT_AVAILABLE"
        | "ENTITLEMENT_CONFLICT"
        | "CLAIM_UNIT_CONFLICT"
        | "PAYMENT_SOURCE_CONFLICT";
    }
  | {
      readonly status: "FAILED";
      readonly code:
        | "INVALID_INPUT"
        | "ACCOUNT_UNAVAILABLE"
        | "LEGAL_UNAVAILABLE"
        | "COMMERCE_PERSISTENCE_UNAVAILABLE"
        | "ENTITLEMENTS_UNAVAILABLE"
        | "CLAIM_UNITS_UNAVAILABLE"
        | "PAYMENTS_UNAVAILABLE"
        | "PAYMENT_PROVIDER_UNAVAILABLE"
        | "PAYMENT_PROVIDER_REJECTED"
        | "PAYMENT_INTENT_MODE_MISMATCH"
        | "PAYMENT_INTENT_CREATION_DISABLED"
        | "PAYMENT_INTENT_PERSISTENCE_UNAVAILABLE"
        | "PAYMENT_INTENT_PROVIDER_UNAVAILABLE"
        | "PAYMENT_INTENT_PROVIDER_REJECTED"
        | "PAYMENT_INTENT_IN_PROGRESS"
        | "PAYMENT_INTENT_RECOVERY_REQUIRED"
        | "PAYMENT_INTENT_MISMATCH";
    };

/** One-shot creation capability; recovery of an already-created order is host-owned. */
export interface CommercePaymentIntentCheckoutCapability {
  start(input: CommerceStartPaymentIntentCheckoutInput): Promise<CommerceStartPaymentIntentCheckoutResult>;
}

import type { CommerceCheckoutOfferSnapshot } from "./checkout-offer-pricing.contract";
import type {
  CommerceCreateOrderInvoiceInput,
  CommerceOrderInvoiceSnapshot,
} from "./order-invoice-creation.contract";
import type { CommerceZeroPaymentFulfillmentSnapshot } from "./zero-payment-fulfillment.contract";

export const COMMERCE_CHECKOUT_ORCHESTRATION_CAPABILITY_ID =
  "bke.commerce.checkout-orchestration.v1" as const;

export interface CommerceCheckoutLegalRequirementInput {
  readonly documentId: string;
  readonly documentVersionId: string;
  readonly acceptanceContext: string;
  readonly slaVersion: string;
  readonly renderedContentSha256: string;
}

export interface CommerceCheckoutPayerInput {
  readonly name: string;
  readonly email: string;
}

export interface CommerceCheckoutPaymentSnapshot {
  readonly attemptId: string;
  readonly provider: string;
  readonly externalCheckoutId: string;
  readonly checkoutUrl: string;
  readonly amountMinor: number;
  readonly currency: string;
}

export interface CommerceStartCheckoutInput {
  readonly principalId: string;
  readonly accountId: string;
  readonly legal: readonly CommerceCheckoutLegalRequirementInput[];
  readonly order: CommerceCreateOrderInvoiceInput;
  readonly offerIdentifier?: string | null;
  readonly paymentSourceReference: string;
  readonly payer: CommerceCheckoutPayerInput;
}

export type CommerceStartCheckoutResult =
  | {
      readonly status: "PAYMENT_READY";
      readonly order: CommerceOrderInvoiceSnapshot;
      readonly payment: CommerceCheckoutPaymentSnapshot;
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
        | "PAYMENTS_UNAVAILABLE"
        | "PAYMENT_PROVIDER_UNAVAILABLE"
        | "PAYMENT_PROVIDER_REJECTED";
    };

export interface CommerceCheckoutOrchestrationCapability {
  start(input: CommerceStartCheckoutInput): Promise<CommerceStartCheckoutResult>;
}

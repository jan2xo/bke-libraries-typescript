import type { CommerceOrderFulfillmentMode } from "./order-invoice-creation.contract";

export const COMMERCE_ZERO_PAYMENT_FULFILLMENT_CAPABILITY_ID =
  "bke.commerce.zero-payment-fulfillment.v1" as const;

export interface CommerceFulfillZeroPaymentInput {
  readonly orderId: string;
  readonly fulfilledAt: Date;
}

export interface CommerceZeroPaymentFulfillmentSnapshot {
  readonly orderId: string;
  readonly invoiceId: string;
  readonly orderStatus: "PAID";
  readonly invoiceStatus: "FINAL";
  readonly fulfillmentMode: CommerceOrderFulfillmentMode;
  readonly entitlementCount: number;
  readonly claimUnitCount: number;
}

export type CommerceFulfillZeroPaymentResult =
  | {
      readonly status: "FULFILLED";
      readonly value: CommerceZeroPaymentFulfillmentSnapshot;
    }
  | {
      readonly status: "REJECTED";
      readonly code:
        | "ORDER_NOT_FOUND"
        | "ORDER_NOT_FULFILLABLE"
        | "ORDER_NOT_ZERO_TOTAL"
        | "ENTITLEMENT_CONFLICT"
        | "CLAIM_UNIT_CONFLICT";
    }
  | {
      readonly status: "FAILED";
      readonly code:
        | "INVALID_INPUT"
        | "COMMERCE_PERSISTENCE_UNAVAILABLE"
        | "ENTITLEMENTS_UNAVAILABLE"
        | "CLAIM_UNITS_UNAVAILABLE";
    };

export interface CommerceZeroPaymentFulfillmentCapability {
  fulfill(input: CommerceFulfillZeroPaymentInput): Promise<CommerceFulfillZeroPaymentResult>;
}

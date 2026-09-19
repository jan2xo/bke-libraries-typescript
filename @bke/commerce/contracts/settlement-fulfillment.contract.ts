export const COMMERCE_SETTLEMENT_FULFILLMENT_CAPABILITY_ID =
  "bke.commerce.settlement-fulfillment.v1" as const;

export type CommerceSettlementFulfillmentMode = "ACCOUNT_ENTITLEMENT" | "CLAIM_CODE";
export type CommerceSettlementFulfillmentDisposition = "STANDARD" | "AFTER_LOCAL_CANCELLATION";

export interface CommerceReactToSettlementFulfillmentInput {
  readonly providerEventRecordId: string;
  readonly expectedLivemode: boolean;
}

export interface CommerceSettlementFulfillmentSnapshot {
  readonly orderId: string;
  readonly invoiceId: string;
  readonly orderStatus: "PAID";
  readonly invoiceStatus: "FINAL";
  readonly settlementDisposition: CommerceSettlementFulfillmentDisposition;
  readonly settlementFactId: string;
  readonly fulfillmentMode: CommerceSettlementFulfillmentMode;
  readonly entitlementCount: number;
  readonly claimUnitCount: number;
}

export type CommerceReactToSettlementFulfillmentResult =
  | { readonly status: "FULFILLED"; readonly value: CommerceSettlementFulfillmentSnapshot }
  | {
      readonly status: "REJECTED";
      readonly code:
        | "PAYMENT_EVENT_REJECTED"
        | "ORDER_NOT_FOUND"
        | "ORDER_NOT_SETTLEABLE"
        | "SETTLEMENT_MISMATCH"
        | "ENTITLEMENT_CONFLICT"
        | "CLAIM_UNIT_CONFLICT";
    }
  | {
      readonly status: "FAILED";
      readonly code:
        | "INVALID_INPUT"
        | "PAYMENTS_UNAVAILABLE"
        | "COMMERCE_PERSISTENCE_UNAVAILABLE"
        | "ENTITLEMENTS_UNAVAILABLE"
        | "CLAIM_UNITS_UNAVAILABLE";
    };

export interface CommerceSettlementFulfillmentCapability {
  react(
    input: CommerceReactToSettlementFulfillmentInput,
  ): Promise<CommerceReactToSettlementFulfillmentResult>;
}

export const COMMERCE_SETTLEMENT_REACTION_CAPABILITY_ID =
  "bke.commerce.settlement-reaction.v1" as const;

export interface CommerceReactToSettlementInput {
  readonly providerEventRecordId: string;
  readonly expectedLivemode: boolean;
}

export interface CommerceSettlementReactionSnapshot {
  readonly orderId: string;
  readonly invoiceId: string;
  readonly orderStatus: "PAID";
  readonly invoiceStatus: "FINAL";
  readonly settlementFactId: string;
  readonly entitlementCount: number;
}

export type CommerceReactToSettlementResult =
  | { readonly status: "FULFILLED"; readonly value: CommerceSettlementReactionSnapshot }
  | {
      readonly status: "REJECTED";
      readonly code:
        | "PAYMENT_EVENT_REJECTED"
        | "ORDER_NOT_FOUND"
        | "ORDER_NOT_SETTLEABLE"
        | "SETTLEMENT_MISMATCH"
        | "ENTITLEMENT_CONFLICT";
    }
  | {
      readonly status: "FAILED";
      readonly code:
        | "INVALID_INPUT"
        | "PAYMENTS_UNAVAILABLE"
        | "COMMERCE_PERSISTENCE_UNAVAILABLE"
        | "ENTITLEMENTS_UNAVAILABLE";
    };

export interface CommerceSettlementReactionCapability {
  react(input: CommerceReactToSettlementInput): Promise<CommerceReactToSettlementResult>;
}

import type {
  CommerceSettlementFulfillmentDisposition,
  CommerceSettlementFulfillmentMode,
} from "../contracts/settlement-fulfillment.contract";

export interface CommerceSettlementFulfillmentOrderItem {
  readonly orderItemId: string;
  readonly productId: string;
  readonly editionId: string | null;
  readonly purchasePlanId: string | null;
  readonly quantity: number;
  readonly entitlementSnapshot: unknown;
  readonly policySnapshot: unknown;
}

export interface CommerceSettlementFulfillmentRecord {
  readonly orderId: string;
  readonly invoiceId: string;
  readonly accountId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly orderStatus: "PENDING" | "PAID";
  readonly invoiceStatus: "DRAFT" | "FINAL";
  readonly settlementDisposition: CommerceSettlementFulfillmentDisposition;
  readonly fulfillmentMode: CommerceSettlementFulfillmentMode;
  readonly items: readonly CommerceSettlementFulfillmentOrderItem[];
}

export interface CommerceSettlementFulfillmentRepository {
  settle(input: {
    readonly orderId: string;
    readonly expectedAmountMinor: number;
    readonly expectedCurrency: string;
    readonly settledAt: Date;
  }): Promise<
    | { readonly status: "SETTLED"; readonly value: CommerceSettlementFulfillmentRecord }
    | {
        readonly status: "REJECTED";
        readonly code: "ORDER_NOT_FOUND" | "ORDER_NOT_SETTLEABLE" | "SETTLEMENT_MISMATCH";
      }
  >;
}

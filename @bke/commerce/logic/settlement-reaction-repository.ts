export interface CommerceSettlementOrderItem {
  readonly orderItemId: string;
  readonly productId: string;
  readonly editionId: string | null;
  readonly quantity: number;
  readonly entitlementSnapshot: unknown;
  readonly policySnapshot: unknown;
}

export interface CommerceSettlementRecord {
  readonly orderId: string;
  readonly invoiceId: string;
  readonly accountId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly orderStatus: "PENDING" | "PAID";
  readonly invoiceStatus: "DRAFT" | "FINAL";
  readonly items: readonly CommerceSettlementOrderItem[];
}

export interface CommerceSettlementReactionRepository {
  settle(input: {
    readonly orderId: string;
    readonly expectedAmountMinor: number;
    readonly expectedCurrency: string;
    readonly settledAt: Date;
  }): Promise<
    | { readonly status: "SETTLED"; readonly value: CommerceSettlementRecord }
    | {
        readonly status: "REJECTED";
        readonly code: "ORDER_NOT_FOUND" | "ORDER_NOT_SETTLEABLE" | "SETTLEMENT_MISMATCH";
      }
  >;
}

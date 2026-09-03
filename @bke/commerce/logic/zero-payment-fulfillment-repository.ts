export interface CommerceZeroPaymentOrderItem {
  readonly orderItemId: string;
  readonly productId: string;
  readonly editionId: string | null;
  readonly quantity: number;
  readonly entitlementSnapshot: unknown;
  readonly policySnapshot: unknown;
}

export interface CommerceZeroPaymentRecord {
  readonly orderId: string;
  readonly invoiceId: string;
  readonly accountId: string;
  readonly orderStatus: "PAID";
  readonly invoiceStatus: "FINAL";
  readonly items: readonly CommerceZeroPaymentOrderItem[];
}

export interface CommerceZeroPaymentFulfillmentRepository {
  fulfill(input: {
    readonly orderId: string;
    readonly fulfilledAt: Date;
  }): Promise<
    | { readonly status: "FULFILLED"; readonly value: CommerceZeroPaymentRecord }
    | {
        readonly status: "REJECTED";
        readonly code: "ORDER_NOT_FOUND" | "ORDER_NOT_FULFILLABLE" | "ORDER_NOT_ZERO_TOTAL";
      }
  >;
}

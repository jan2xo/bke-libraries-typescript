export const PAYMENTS_REFUND_INITIATION_CAPABILITY_ID = "bke.payments.refund-initiation.v1" as const;

export type PaymentsRefundReason = "requested_by_customer" | "duplicate" | "fraudulent" | "other";
export type PaymentsRefundOperationState = "CREATING" | "PENDING" | "SUCCEEDED" | "FAILED";

export interface PaymentsInitiateRefundInput {
  readonly sourceReference: string;
  readonly settlementFactId: string;
  readonly amountMinor: number;
  readonly reason: PaymentsRefundReason;
  readonly notes?: string;
}

export interface PaymentsRefundOperationSnapshot {
  readonly refundOperationId: string;
  readonly sourceReference: string;
  readonly settlementFactId: string;
  readonly provider: string;
  readonly externalPaymentId: string;
  readonly externalRefundId?: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly reason: PaymentsRefundReason;
  readonly state: PaymentsRefundOperationState;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type PaymentsInitiateRefundResult =
  | { readonly status: "REFUND"; readonly disposition: "CREATED" | "EXISTING"; readonly value: PaymentsRefundOperationSnapshot }
  | { readonly status: "REJECTED"; readonly code: "SETTLEMENT_NOT_FOUND" | "AMOUNT_EXCEEDS_SETTLEMENT" | "SOURCE_CONFLICT" | "REFUND_NOT_ALLOWED" }
  | { readonly status: "FAILED"; readonly code: "INVALID_INPUT" | "PROVIDER_UNAVAILABLE" | "PERSISTENCE_UNAVAILABLE" };

export interface PaymentsRefundInitiationCapability {
  initiate(input: PaymentsInitiateRefundInput): Promise<PaymentsInitiateRefundResult>;
}

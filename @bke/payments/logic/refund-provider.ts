import type { PaymentsRefundReason } from "../contracts/refund-initiation.contract";

export interface PaymentsRefundProviderInput {
  readonly externalPaymentId: string;
  readonly amountMinor: number;
  readonly reason: PaymentsRefundReason;
  readonly notes?: string;
  readonly idempotencyKey: string;
}

export interface PaymentsRefundProviderResult {
  readonly externalRefundId: string;
  readonly status: "pending" | "succeeded" | "failed";
  readonly amountMinor: number;
  readonly externalPaymentId: string;
}

export interface PaymentsRefundProvider {
  readonly name: string;
  createRefund(input: PaymentsRefundProviderInput): Promise<PaymentsRefundProviderResult>;
}

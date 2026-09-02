import type { PaymentsRefundOperationSnapshot, PaymentsRefundReason } from "../contracts/refund-initiation.contract";
import type { PaymentsSettlementFactSnapshot } from "../contracts/settlement-fact.contract";

export interface PaymentsRefundOperationClaim {
  readonly id: string;
  readonly sourceReference: string;
  readonly settlementFactId: string;
  readonly provider: string;
  readonly externalPaymentId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly reason: PaymentsRefundReason;
  readonly notes: string | null;
}

export type PaymentsRefundClaimResult =
  | { readonly outcome: "CLAIMED"; readonly created: boolean; readonly record: PaymentsRefundOperationSnapshot & { readonly notes: string | null } }
  | { readonly outcome: "AMOUNT_EXCEEDS_SETTLEMENT" };

export interface PaymentsRefundRepository {
  findSettlementFact(id: string): Promise<PaymentsSettlementFactSnapshot | null>;
  claim(input: PaymentsRefundOperationClaim): Promise<PaymentsRefundClaimResult>;
  markProviderResult(id: string, externalRefundId: string, state: "PENDING" | "SUCCEEDED" | "FAILED"): Promise<PaymentsRefundOperationSnapshot & { readonly notes: string | null }>;
  markFailed(id: string): Promise<PaymentsRefundOperationSnapshot & { readonly notes: string | null }>;
}

export const PAYMENTS_RECONCILIATION_CAPABILITY_ID = "bke.payments.reconciliation.v1" as const;

export type PaymentsReconciliationClassification =
  | "MATCHED"
  | "AMOUNT_MISMATCH"
  | "CURRENCY_MISMATCH"
  | "MODE_MISMATCH"
  | "STATUS_MISMATCH";

export type PaymentsReconciliationState = "MATCHED" | "OPEN" | "ACKNOWLEDGED";

export interface PaymentsRetrievedPayment {
  readonly externalPaymentId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly status: "paid" | "failed" | "refunded" | "pending";
  readonly livemode: boolean;
}

export interface PaymentsReconciliationSnapshot {
  readonly reconciliationId: string;
  readonly commercialReference: string;
  readonly settlementFactId: string | null;
  readonly provider: string;
  readonly externalPaymentId: string | null;
  readonly classification: PaymentsReconciliationClassification | "PROVIDER_UNAVAILABLE";
  readonly differences: readonly string[];
  readonly localStatus: string;
  readonly providerStatus: string | null;
  readonly state: PaymentsReconciliationState;
  readonly correlationId: string;
  readonly runById: string;
  readonly acknowledgedAt: Date | null;
  readonly acknowledgedById: string | null;
  readonly lastErrorCode: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type PaymentsRunReconciliationResult =
  | { readonly status: "RECONCILED"; readonly value: PaymentsReconciliationSnapshot }
  | { readonly status: "REJECTED"; readonly code: "SETTLEMENT_NOT_FOUND" }
  | { readonly status: "FAILED"; readonly code: "INVALID_INPUT" | "PROVIDER_UNAVAILABLE" | "PERSISTENCE_UNAVAILABLE" };

export type PaymentsAcknowledgeReconciliationResult =
  | { readonly status: "ACKNOWLEDGED"; readonly value: PaymentsReconciliationSnapshot }
  | { readonly status: "REJECTED"; readonly code: "RECONCILIATION_NOT_FOUND" }
  | { readonly status: "FAILED"; readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE" };

export type PaymentsListReconciliationsResult =
  | { readonly status: "LISTED"; readonly values: readonly PaymentsReconciliationSnapshot[] }
  | { readonly status: "FAILED"; readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE" };

export interface PaymentsReconciliationCapability {
  run(input: { readonly commercialReference: string; readonly runById: string }): Promise<PaymentsRunReconciliationResult>;
  acknowledge(input: { readonly reconciliationId: string; readonly actorId: string }): Promise<PaymentsAcknowledgeReconciliationResult>;
  listRecent(input?: { readonly limit?: number }): Promise<PaymentsListReconciliationsResult>;
}

export const PAYMENTS_SETTLEMENT_FACT_CAPABILITY_ID =
  "bke.payments.settlement-fact.v1" as const;

export interface PaymentsReconcileSettlementInput {
  readonly providerEventRecordId: string;
  readonly expectedLivemode: boolean;
}

export interface PaymentsSettlementFactSnapshot {
  readonly settlementFactId: string;
  readonly providerEventRecordId: string;
  readonly checkoutAttemptId: string;
  readonly provider: string;
  readonly eventId: string;
  readonly externalPaymentId: string;
  readonly externalCheckoutId: string;
  readonly commercialReference: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly livemode: boolean;
  readonly settledAt: Date;
  readonly createdAt: Date;
}

export type PaymentsReconcileSettlementResult =
  | {
      readonly status: "SETTLED";
      readonly disposition: "CREATED" | "EXISTING";
      readonly value: PaymentsSettlementFactSnapshot;
    }
  | {
      readonly status: "REJECTED";
      readonly code:
        | "EVENT_NOT_FOUND"
        | "UNSUPPORTED_EVENT"
        | "MODE_MISMATCH"
        | "CHECKOUT_MISMATCH"
        | "REFERENCE_MISMATCH"
        | "AMOUNT_MISMATCH"
        | "CURRENCY_MISMATCH"
        | "PAYMENT_REFERENCE_MISSING"
        | "SETTLEMENT_CONFLICT";
    }
  | {
      readonly status: "FAILED";
      readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE";
    };

export interface PaymentsSettlementFactCapability {
  reconcile(input: PaymentsReconcileSettlementInput): Promise<PaymentsReconcileSettlementResult>;
}

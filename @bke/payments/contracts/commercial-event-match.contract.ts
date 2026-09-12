export const PAYMENTS_COMMERCIAL_EVENT_MATCH_CAPABILITY_ID =
  "bke.payments.commercial-event-match.v1" as const;

export type PaymentsCommercialEventMatchType =
  | "payment.paid"
  | "payment.failed"
  | "payment.refund.updated";

export interface PaymentsCommercialOrderFact {
  readonly orderId: string;
  readonly commercialReference: string;
  readonly amountMinor: number;
  readonly currency: string;
}

export interface PaymentsCommercialEventMatchEvent {
  readonly type: PaymentsCommercialEventMatchType;
  readonly externalCheckoutId: string | null;
  readonly externalPaymentId: string | null;
  readonly reference: string | null;
  readonly amountMinor: number | null;
  readonly currency: string | null;
}

export interface PaymentsCommercialEventMatchInput {
  readonly event: PaymentsCommercialEventMatchEvent;
  readonly attemptOrder: PaymentsCommercialOrderFact | null;
  readonly referenceOrder: PaymentsCommercialOrderFact | null;
  readonly knownPaymentOrder: PaymentsCommercialOrderFact | null;
}

export type PaymentsCommercialEventMatchFailureCode =
  | "PAYMENT_CHECKOUT_MISMATCH"
  | "PAYMENT_REFERENCE_MISMATCH"
  | "PAYMENT_AMOUNT_MISMATCH"
  | "PAYMENT_CURRENCY_MISMATCH";

export type PaymentsCommercialEventMatchResult =
  | {
      readonly status: "MATCHED";
      readonly order: PaymentsCommercialOrderFact;
      readonly matchedBy: "CHECKOUT" | "REFERENCE" | "KNOWN_PAYMENT";
    }
  | {
      readonly status: "REJECTED";
      readonly code: PaymentsCommercialEventMatchFailureCode;
    };

export interface PaymentsCommercialEventMatchCapability {
  match(input: PaymentsCommercialEventMatchInput): PaymentsCommercialEventMatchResult;
}

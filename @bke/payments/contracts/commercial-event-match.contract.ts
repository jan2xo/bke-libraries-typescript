export const PAYMENTS_COMMERCIAL_EVENT_MATCH_CAPABILITY_ID =
  "bke.payments.commercial-event-match.v1" as const;

export type PaymentsCommercialEventMatchType =
  | "payment.paid"
  | "payment.failed"
  | "payment.refunded"
  | "payment.refund.updated";

export interface PaymentsProviderEventModeInput {
  readonly eventLivemode: boolean;
  readonly expectedLivemode: boolean;
}

export type PaymentsProviderEventModeResult =
  | { readonly status: "MATCHED" }
  | { readonly status: "REJECTED"; readonly code: "PAYMENT_MODE_MISMATCH" };

export interface PaymentsCommercialOrderFact {
  readonly orderId: string;
  readonly commercialReference: string;
  readonly amountMinor: number;
  readonly currency: string;
}

export interface PaymentsCommercialEventMatchEvent {
  readonly type: PaymentsCommercialEventMatchType;
  readonly livemode: boolean;
  readonly externalCheckoutId: string | null;
  readonly externalPaymentId: string | null;
  readonly reference: string | null;
  readonly amountMinor: number | null;
  readonly currency: string | null;
}

export interface PaymentsCommercialEventMatchInput {
  readonly event: PaymentsCommercialEventMatchEvent;
  readonly expectedLivemode: boolean;
  readonly attemptOrder: PaymentsCommercialOrderFact | null;
  readonly referenceOrder: PaymentsCommercialOrderFact | null;
  readonly knownPaymentOrder: PaymentsCommercialOrderFact | null;
}

export type PaymentsCommercialEventMatchFailureCode =
  | "PAYMENT_MODE_MISMATCH"
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
  validateMode(input: PaymentsProviderEventModeInput): PaymentsProviderEventModeResult;
  match(input: PaymentsCommercialEventMatchInput): PaymentsCommercialEventMatchResult;
}

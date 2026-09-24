export const PAYMENTS_CHECKOUT_ATTEMPT_LOOKUP_CAPABILITY_ID =
  "bke.payments.checkout-attempt-lookup.v1" as const;

export interface PaymentsFindCheckoutAttemptInput {
  readonly sourceReference: string;
}

export interface PaymentsCheckoutAttemptLookupSnapshot {
  readonly attemptId: string;
  readonly sourceReference: string;
  readonly commercialReference: string;
  readonly status: "CREATING" | "PENDING" | "CANCELLED" | "FAILED";
  readonly checkoutUrl: string | null;
  readonly failureCode: string | null;
  readonly amountMinor: number;
  readonly currency: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type PaymentsFindCheckoutAttemptResult =
  | { readonly status: "FOUND"; readonly value: PaymentsCheckoutAttemptLookupSnapshot }
  | { readonly status: "NOT_FOUND" }
  | { readonly status: "FAILED"; readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE" };

export interface PaymentsCheckoutAttemptLookupCapability {
  find(input: PaymentsFindCheckoutAttemptInput): Promise<PaymentsFindCheckoutAttemptResult>;
}

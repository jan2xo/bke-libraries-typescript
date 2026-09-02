export const PAYMENTS_CHECKOUT_ATTEMPT_CAPABILITY_ID =
  "bke.payments.checkout-attempt.v1" as const;

export interface PaymentsCheckoutPayerInput {
  readonly name: string;
  readonly email: string;
}

export interface PaymentsCheckoutLineItemInput {
  readonly name: string;
  readonly description?: string;
  readonly amountMinor: number;
  readonly quantity: number;
}

export interface PaymentsCreateCheckoutAttemptInput {
  readonly sourceReference: string;
  readonly commercialReference: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly payer: PaymentsCheckoutPayerInput;
  readonly items: readonly PaymentsCheckoutLineItemInput[];
}

export interface PaymentsCheckoutAttemptSnapshot {
  readonly attemptId: string;
  readonly sourceReference: string;
  readonly provider: string;
  readonly status: "PENDING";
  readonly externalCheckoutId: string;
  readonly checkoutUrl: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly createdAt: Date;
}

export type PaymentsCreateCheckoutAttemptResult =
  | {
      readonly status: "READY";
      readonly disposition: "CREATED" | "EXISTING";
      readonly value: PaymentsCheckoutAttemptSnapshot;
    }
  | { readonly status: "REJECTED"; readonly code: "SOURCE_CONFLICT" }
  | {
      readonly status: "FAILED";
      readonly code:
        | "INVALID_INPUT"
        | "PERSISTENCE_UNAVAILABLE"
        | "PROVIDER_UNAVAILABLE"
        | "PROVIDER_REJECTED";
    };

export interface PaymentsCheckoutAttemptCapability {
  create(input: PaymentsCreateCheckoutAttemptInput): Promise<PaymentsCreateCheckoutAttemptResult>;
}

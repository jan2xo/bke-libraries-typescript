import type {
  PaymentsCheckoutLineItemInput,
  PaymentsCheckoutPayerInput,
} from "../contracts/checkout-attempt.contract";

export interface PaymentsProviderCheckoutInput {
  readonly attemptId: string;
  readonly sourceReference: string;
  readonly commercialReference: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly payer: PaymentsCheckoutPayerInput;
  readonly items: readonly PaymentsCheckoutLineItemInput[];
  readonly idempotencyKey: string;
}

export interface PaymentsProviderCheckoutResult {
  readonly externalCheckoutId: string;
  readonly checkoutUrl: string;
}

export type PaymentsProviderFailureCode = "PROVIDER_UNAVAILABLE" | "PROVIDER_REJECTED";

export class PaymentsProviderError extends Error {
  constructor(
    readonly code: PaymentsProviderFailureCode,
    message = code,
  ) {
    super(message);
    this.name = "PaymentsProviderError";
  }
}

export interface PaymentsCheckoutProvider {
  readonly name: string;
  createCheckout(input: PaymentsProviderCheckoutInput): Promise<PaymentsProviderCheckoutResult>;
}

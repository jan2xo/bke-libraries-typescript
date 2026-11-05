import type { PaymentsPaymentIntentStatus, PaymentsPaymentIntentContinuation } from "../contracts/payment-intent.contract";
export interface PaymentsProviderCreatePaymentIntentInput {
  readonly amountMinor: number;
  readonly currency: string;
  readonly paymentMethodAllowed: readonly string[];
  readonly commercialReference: string;
  readonly sourceReference: string;
  readonly idempotencyKey: string;
}
export interface PaymentsProviderPaymentIntent {
  readonly paymentIntentId: string;
  readonly clientKey?: string;
  readonly status: PaymentsPaymentIntentStatus;
  readonly amountMinor: number;
  readonly currency: string;
  readonly livemode: boolean;
}
export interface PaymentsPaymentIntentProvider {
  readonly name: string;
  readonly livemode: boolean;
  createPaymentIntent(input: PaymentsProviderCreatePaymentIntentInput): Promise<PaymentsProviderPaymentIntent>;
  retrievePaymentIntent(paymentIntentId: string): Promise<PaymentsProviderPaymentIntent>;
  createPaymentMethod(input: { readonly type: string; readonly expirySeconds?: number }): Promise<{ readonly paymentMethodId: string; readonly type: string }>;
  attachPaymentMethod(input: { readonly paymentIntentId: string; readonly paymentMethodId: string; readonly clientKey: string }): Promise<PaymentsPaymentIntentContinuation>;
}
export class PaymentsPaymentIntentProviderError extends Error {
  constructor(readonly code: "PROVIDER_UNAVAILABLE" | "PROVIDER_REJECTED", message: string = code) {
    super(message);
    this.name = "PaymentsPaymentIntentProviderError";
  }
}

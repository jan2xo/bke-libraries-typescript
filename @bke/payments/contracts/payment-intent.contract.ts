export const PAYMENTS_PAYMENT_INTENT_CAPABILITY_ID = "bke.payments.payment-intent.v1" as const;
export type PaymentsPaymentIntentStatus = "awaiting_payment_method" | "awaiting_next_action" | "processing" | "succeeded" | "cancelled";
export interface PaymentsCreatePaymentIntentInput {
  readonly sourceReference: string;
  readonly commercialReference: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly livemode: boolean;
  readonly paymentMethodAllowed: readonly string[];
}
export interface PaymentsPaymentIntentSnapshot {
  readonly attemptId: string;
  readonly sourceReference: string;
  readonly provider: string;
  readonly paymentIntentId: string;
  readonly clientKey: string;
  readonly status: PaymentsPaymentIntentStatus;
  readonly amountMinor: number;
  readonly currency: string;
  readonly livemode: boolean;
  readonly createdAt: Date;
}
export interface PaymentsPaymentIntentContinuation {
  readonly paymentIntentId: string;
  readonly status: PaymentsPaymentIntentStatus;
  readonly qrImageUrl?: string;
  readonly redirectUrl?: string;
  readonly expiresAt?: Date;
}
export interface PaymentsPaymentIntentCapability {
  create(input: PaymentsCreatePaymentIntentInput): Promise<
    | { readonly status: "READY"; readonly disposition: "CREATED" | "EXISTING"; readonly value: PaymentsPaymentIntentSnapshot }
    | { readonly status: "REJECTED"; readonly code: "SOURCE_CONFLICT" }
    | { readonly status: "FAILED"; readonly code: "INVALID_INPUT" | "MODE_MISMATCH" | "CREATION_DISABLED" | "PERSISTENCE_UNAVAILABLE" | "PROVIDER_UNAVAILABLE" | "PROVIDER_REJECTED" | "REQUEST_IN_PROGRESS" | "RECOVERY_REQUIRED" | "PAYMENT_INTENT_MISMATCH" }
  >;
  createPaymentMethod(input: { readonly attemptId: string; readonly type: string; readonly expirySeconds?: number }): Promise<
    | { readonly status: "CREATED"; readonly value: { readonly paymentMethodId: string; readonly type: string } }
    | { readonly status: "REJECTED"; readonly code: "INVALID_INPUT" | "PAYMENT_INTENT_MISMATCH" }
    | { readonly status: "FAILED"; readonly code: "PERSISTENCE_UNAVAILABLE" | "PROVIDER_UNAVAILABLE" | "PROVIDER_REJECTED" }
  >;
  attachPaymentMethod(input: { readonly attemptId: string; readonly paymentMethodId: string; readonly clientKey: string }): Promise<
    | { readonly status: "ATTACHED"; readonly value: PaymentsPaymentIntentContinuation }
    | { readonly status: "REJECTED"; readonly code: "INVALID_INPUT" | "PAYMENT_INTENT_MISMATCH" }
    | { readonly status: "FAILED"; readonly code: "PERSISTENCE_UNAVAILABLE" | "PROVIDER_UNAVAILABLE" | "PROVIDER_REJECTED" }
  >;
}

import type { PaymentsPaymentIntentStatus } from "../contracts/payment-intent.contract";
export type PaymentsPaymentIntentAttemptStatus = "CREATING" | "UNKNOWN" | "AWAITING_PAYMENT_METHOD" | "AWAITING_NEXT_ACTION" | "PROCESSING" | "SUCCEEDED" | "CANCELLED" | "FAILED";
export interface PaymentsPaymentIntentAttemptRecord {
  readonly id: string;
  readonly sourceReference: string;
  readonly commercialReference: string;
  readonly provider: string;
  readonly requestFingerprint: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly paymentMethodAllowed: readonly string[];
  readonly livemode: boolean;
  readonly idempotencyKey: string;
  readonly idempotencyExpiresAt: Date;
  readonly createDispatchedAt: Date | null;
  readonly createLeaseUntil: Date | null;
  readonly createLeaseToken: string | null;
  readonly statusObservedAt: Date | null;
  readonly paymentIntentId: string | null;
  readonly status: PaymentsPaymentIntentAttemptStatus;
  readonly failureCode: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
export interface PaymentsPaymentIntentAttemptClaim {
  readonly id: string;
  readonly sourceReference: string;
  readonly commercialReference: string;
  readonly provider: string;
  readonly requestFingerprint: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly paymentMethodAllowed: readonly string[];
  readonly livemode: boolean;
  readonly idempotencyKey: string;
  readonly idempotencyExpiresAt: Date;
}
export type PaymentsPaymentIntentCreateLease = { readonly status: "ACQUIRED" | "BUSY" | "EXPIRED" | "ALREADY_BOUND"; readonly record: PaymentsPaymentIntentAttemptRecord };
export interface PaymentsPaymentIntentAttemptRepository {
  findById(id: string): Promise<PaymentsPaymentIntentAttemptRecord | null>;
  findByProviderIntent(provider: string, paymentIntentId: string): Promise<PaymentsPaymentIntentAttemptRecord | null>;
  claim(input: PaymentsPaymentIntentAttemptClaim): Promise<{ readonly created: boolean; readonly record: PaymentsPaymentIntentAttemptRecord }>;
  beginCreate(id: string, now: Date, leaseMilliseconds: number): Promise<PaymentsPaymentIntentCreateLease>;
  markUnknown(id: string, leaseToken: string): Promise<boolean>;
  markFailed(id: string, failureCode: string, leaseToken: string): Promise<boolean>;
  bindPaymentIntent(id: string, paymentIntentId: string, status: PaymentsPaymentIntentStatus, leaseToken: string, observedAt: Date): Promise<PaymentsPaymentIntentAttemptRecord>;
  updateStatus(id: string, status: PaymentsPaymentIntentStatus, observedAt: Date): Promise<PaymentsPaymentIntentAttemptRecord>;
}

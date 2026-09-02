export type PaymentsCheckoutAttemptState = "CREATING" | "PENDING" | "FAILED";

export interface PaymentsCheckoutAttemptRecord {
  readonly id: string;
  readonly sourceReference: string;
  readonly commercialReference: string;
  readonly provider: string;
  readonly requestFingerprint: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly payerSnapshot: unknown;
  readonly itemsSnapshot: unknown;
  readonly status: PaymentsCheckoutAttemptState;
  readonly externalCheckoutId: string | null;
  readonly checkoutUrl: string | null;
  readonly failureCode: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PaymentsCheckoutAttemptClaim {
  readonly id: string;
  readonly sourceReference: string;
  readonly commercialReference: string;
  readonly provider: string;
  readonly requestFingerprint: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly payerSnapshot: unknown;
  readonly itemsSnapshot: unknown;
}

export interface PaymentsCheckoutAttemptRepository {
  claim(input: PaymentsCheckoutAttemptClaim): Promise<{
    readonly created: boolean;
    readonly record: PaymentsCheckoutAttemptRecord;
  }>;
  markPending(
    id: string,
    externalCheckoutId: string,
    checkoutUrl: string,
  ): Promise<PaymentsCheckoutAttemptRecord>;
  markFailed(id: string, failureCode: string): Promise<PaymentsCheckoutAttemptRecord>;
}

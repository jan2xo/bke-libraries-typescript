import type {
  PaymentsProviderEventType,
  PaymentsRefundStatus,
} from "../contracts/provider-event-ingestion.contract";

export interface PaymentsVerifiedProviderEvent {
  readonly eventId: string;
  readonly rawType?: string;
  readonly type: PaymentsProviderEventType;
  readonly externalPaymentId?: string;
  readonly externalCheckoutId?: string;
  readonly reference?: string;
  readonly externalRefundId?: string;
  readonly refundStatus?: PaymentsRefundStatus;
  readonly amountMinor?: number;
  readonly currency?: string;
  readonly livemode: boolean;
  readonly occurredAt: Date;
}

export interface PaymentsProviderEventVerifier {
  readonly name: string;
  verifyAndParse(
    rawBody: Uint8Array,
    headers: Readonly<Record<string, string>>,
  ): Promise<PaymentsVerifiedProviderEvent>;
}

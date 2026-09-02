import type {
  PaymentsProviderEventType,
  PaymentsRefundStatus,
} from "../contracts/provider-event-ingestion.contract";

export interface PaymentsProviderEventRecord {
  readonly id: string;
  readonly provider: string;
  readonly eventId: string;
  readonly payloadHash: string;
  readonly eventFingerprint: string;
  readonly rawType: string | null;
  readonly type: PaymentsProviderEventType;
  readonly externalPaymentId: string | null;
  readonly externalCheckoutId: string | null;
  readonly reference: string | null;
  readonly externalRefundId: string | null;
  readonly refundStatus: PaymentsRefundStatus | null;
  readonly amountMinor: number | null;
  readonly currency: string | null;
  readonly livemode: boolean;
  readonly occurredAt: Date;
  readonly receivedAt: Date;
}

export interface PaymentsProviderEventClaim {
  readonly id: string;
  readonly provider: string;
  readonly eventId: string;
  readonly payloadHash: string;
  readonly eventFingerprint: string;
  readonly rawType: string | null;
  readonly type: PaymentsProviderEventType;
  readonly externalPaymentId: string | null;
  readonly externalCheckoutId: string | null;
  readonly reference: string | null;
  readonly externalRefundId: string | null;
  readonly refundStatus: PaymentsRefundStatus | null;
  readonly amountMinor: number | null;
  readonly currency: string | null;
  readonly livemode: boolean;
  readonly occurredAt: Date;
}

export interface PaymentsProviderEventRepository {
  claim(input: PaymentsProviderEventClaim): Promise<{
    readonly created: boolean;
    readonly record: PaymentsProviderEventRecord;
  }>;
}

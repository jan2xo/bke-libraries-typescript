export const PAYMENTS_PROVIDER_EVENT_INGESTION_CAPABILITY_ID =
  "bke.payments.provider-event-ingestion.v1" as const;

export type PaymentsProviderEventType =
  | "payment.paid"
  | "payment.failed"
  | "payment.refunded"
  | "payment.refund.updated"
  | "unknown";

export type PaymentsRefundStatus = "pending" | "succeeded" | "failed";

export interface PaymentsIngestProviderEventInput {
  readonly rawBody: Uint8Array;
  readonly headers: Readonly<Record<string, string>>;
}

export interface PaymentsVerifiedProviderEventSnapshot {
  readonly providerEventRecordId: string;
  readonly provider: string;
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
  readonly receivedAt: Date;
}

export type PaymentsIngestProviderEventResult =
  | {
      readonly status: "VERIFIED";
      readonly disposition: "CREATED" | "EXISTING";
      readonly value: PaymentsVerifiedProviderEventSnapshot;
    }
  | { readonly status: "REJECTED"; readonly code: "EVENT_CONFLICT" }
  | {
      readonly status: "FAILED";
      readonly code:
        | "INVALID_INPUT"
        | "VERIFICATION_FAILED"
        | "PERSISTENCE_UNAVAILABLE";
    };

export interface PaymentsProviderEventIngestionCapability {
  ingest(input: PaymentsIngestProviderEventInput): Promise<PaymentsIngestProviderEventResult>;
}

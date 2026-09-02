import type { PaymentsSettlementFactSnapshot } from "../contracts/settlement-fact.contract";
import type { PaymentsCheckoutAttemptRecord } from "./checkout-attempt-repository";
import type { PaymentsProviderEventRecord } from "./provider-event-repository";

export interface PaymentsSettlementFactClaim {
  readonly id: string;
  readonly providerEventRecordId: string;
  readonly checkoutAttemptId: string;
  readonly provider: string;
  readonly eventId: string;
  readonly externalPaymentId: string;
  readonly externalCheckoutId: string;
  readonly commercialReference: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly livemode: boolean;
  readonly settledAt: Date;
}

export interface PaymentsSettlementFactRepository {
  findProviderEventById(id: string): Promise<PaymentsProviderEventRecord | null>;
  findCheckoutAttempt(provider: string, externalCheckoutId: string): Promise<PaymentsCheckoutAttemptRecord | null>;
  claim(input: PaymentsSettlementFactClaim): Promise<{
    readonly created: boolean;
    readonly record: PaymentsSettlementFactSnapshot;
  }>;
}

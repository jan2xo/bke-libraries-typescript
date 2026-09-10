import type { PaymentsReconciliationSnapshot } from "../contracts/reconciliation.contract";
import type { PaymentsSettlementFactSnapshot } from "../contracts/settlement-fact.contract";

export interface PaymentsReconciliationRecordInput {
  readonly id: string;
  readonly commercialReference: string;
  readonly settlementFactId: string | null;
  readonly provider: string;
  readonly externalPaymentId: string | null;
  readonly classification: PaymentsReconciliationSnapshot["classification"];
  readonly differences: readonly string[];
  readonly localStatus: string;
  readonly providerStatus: string | null;
  readonly state: "MATCHED" | "OPEN";
  readonly correlationId: string;
  readonly runById: string;
  readonly lastErrorCode: string | null;
}

export interface PaymentsReconciliationRepository {
  findLatestSettlementFactByCommercialReference(commercialReference: string): Promise<PaymentsSettlementFactSnapshot | null>;
  create(input: PaymentsReconciliationRecordInput): Promise<PaymentsReconciliationSnapshot>;
  acknowledge(id: string, actorId: string): Promise<PaymentsReconciliationSnapshot | null>;
  listRecent(limit: number): Promise<readonly PaymentsReconciliationSnapshot[]>;
}

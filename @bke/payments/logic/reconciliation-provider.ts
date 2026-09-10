import type { PaymentsRetrievedPayment } from "../contracts/reconciliation.contract";

export interface PaymentsReconciliationProvider {
  readonly name: string;
  retrievePayment(externalPaymentId: string): Promise<PaymentsRetrievedPayment>;
}

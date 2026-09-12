export const COMMERCE_PAYMENT_OUTCOME_REACTION_CAPABILITY_ID =
  "bke.commerce.payment-outcome-reaction.v1" as const;

export type CommercePaymentOutcomeOrderStatus =
  | "PENDING"
  | "CANCELLED"
  | "PAID"
  | "REFUNDED"
  | string;

export type CommerceRefundProviderStatus = "pending" | "failed" | "succeeded";

export type CommercePaymentOutcomeInput =
  | Readonly<{
      kind: "PAYMENT_PAID";
      orderStatus: CommercePaymentOutcomeOrderStatus;
      hasPaymentAttempt: boolean;
    }>
  | Readonly<{
      kind: "PAYMENT_FAILED";
      orderStatus: CommercePaymentOutcomeOrderStatus;
      hasExternalPaymentId: boolean;
    }>
  | Readonly<{
      kind: "REFUND_UPDATED";
      orderStatus: CommercePaymentOutcomeOrderStatus;
      refundStatus: CommerceRefundProviderStatus;
      hasExternalRefundId: boolean;
    }>;

export type CommercePaymentOutcomePlan =
  | Readonly<{
      status: "NOOP";
      reason: "ORDER_NOT_SETTLEMENT_MUTABLE" | "ORDER_NOT_FAILURE_MUTABLE" | "ALREADY_REFUNDED";
    }>
  | Readonly<{
      status: "REJECTED";
      code: "PAYMENT_REFUND_CONFLICT";
    }>
  | Readonly<{
      status: "APPLY";
      kind: "PAYMENT_PAID";
      upsertPaymentPaid: true;
      markOrderPaid: true;
      markAttemptCompleted: boolean;
      finalizeInvoice: true;
      applyOfferRedemption: true;
      issueEntitlements: true;
      emailTypes: readonly ["ORDER_CONFIRMED", "INVOICE_READY", "LICENSES_READY"];
      auditAction: "PAYMENT_SETTLED" | "PAYMENT_SETTLED_AFTER_LOCAL_CANCELLATION";
    }>
  | Readonly<{
      status: "APPLY";
      kind: "PAYMENT_FAILED";
      markPaymentFailed: boolean;
      markAttemptFailed: true;
      emailType: "PAYMENT_FAILED";
      auditAction: "PAYMENT_FAILED";
    }>
  | Readonly<{
      status: "APPLY";
      kind: "REFUND_PENDING" | "REFUND_FAILED";
      refundOperationStatus: "PENDING" | "FAILED";
      refundOperationErrorCode: null | "PAYMENT_REFUND_NOT_ALLOWED";
    }>
  | Readonly<{
      status: "APPLY";
      kind: "REFUND_SUCCEEDED";
      markPaymentsRefunded: true;
      markOrderRefunded: true;
      voidInvoice: true;
      markOfferRedemptionsRefunded: true;
      completeRefundOperation: boolean;
      revokeLicensing: true;
      cancelSubscriptions: true;
      emailType: "REFUND_CONFIRMED";
      auditAction: "PAYMENT_REFUND_CONFIRMED";
    }>;

export interface CommercePaymentOutcomeReactionCapability {
  plan(input: CommercePaymentOutcomeInput): CommercePaymentOutcomePlan;
}

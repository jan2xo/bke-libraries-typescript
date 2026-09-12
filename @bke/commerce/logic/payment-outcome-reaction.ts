import type {
  CommercePaymentOutcomeInput,
  CommercePaymentOutcomePlan,
  CommercePaymentOutcomeReactionCapability,
} from "../contracts/payment-outcome-reaction.contract";

export function createCommercePaymentOutcomeReactionCapability(): CommercePaymentOutcomeReactionCapability {
  return Object.freeze({
    plan(input: CommercePaymentOutcomeInput): CommercePaymentOutcomePlan {
      if (input.kind === "PAYMENT_PAID") {
        if (input.orderStatus !== "PENDING" && input.orderStatus !== "CANCELLED") {
          return { status: "NOOP", reason: "ORDER_NOT_SETTLEMENT_MUTABLE" };
        }
        return {
          status: "APPLY",
          kind: "PAYMENT_PAID",
          upsertPaymentPaid: true,
          markOrderPaid: true,
          markAttemptCompleted: input.hasPaymentAttempt,
          finalizeInvoice: true,
          applyOfferRedemption: true,
          issueEntitlements: true,
          emailTypes: ["PAYMENT_RECEIPT", "INVOICE_ISSUED", "LICENSE_ISSUED"] as const,
          auditAction:
            input.orderStatus === "CANCELLED"
              ? "PAYMENT_SETTLED_AFTER_LOCAL_CANCELLATION"
              : "PAYMENT_SETTLED",
        };
      }

      if (input.kind === "PAYMENT_FAILED") {
        if (input.orderStatus !== "PENDING" && input.orderStatus !== "CANCELLED") {
          return { status: "NOOP", reason: "ORDER_NOT_FAILURE_MUTABLE" };
        }
        return {
          status: "APPLY",
          kind: "PAYMENT_FAILED",
          markPaymentFailed: input.hasExternalPaymentId,
          markAttemptFailed: true,
          emailType: "PAYMENT_FAILED",
          auditAction: "PAYMENT_FAILED",
        };
      }

      if (input.refundStatus !== "succeeded") {
        return {
          status: "APPLY",
          kind: input.refundStatus === "failed" ? "REFUND_FAILED" : "REFUND_PENDING",
          refundOperationStatus: input.refundStatus === "failed" ? "FAILED" : "PENDING",
          refundOperationErrorCode:
            input.refundStatus === "failed" ? "PAYMENT_REFUND_NOT_ALLOWED" : null,
        };
      }

      if (input.orderStatus === "REFUNDED") {
        return { status: "NOOP", reason: "ALREADY_REFUNDED" };
      }
      if (input.orderStatus !== "PAID") {
        return { status: "REJECTED", code: "PAYMENT_REFUND_CONFLICT" };
      }

      return {
        status: "APPLY",
        kind: "REFUND_SUCCEEDED",
        markPaymentsRefunded: true,
        markOrderRefunded: true,
        voidInvoice: true,
        markOfferRedemptionsRefunded: true,
        completeRefundOperation: input.hasExternalRefundId,
        revokeLicensing: true,
        cancelSubscriptions: true,
        emailType: "REFUND_CONFIRMED",
        auditAction: "PAYMENT_REFUND_CONFIRMED",
      };
    },
  });
}

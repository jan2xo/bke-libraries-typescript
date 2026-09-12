import { describe, expect, it } from "vitest";
import { createCommercePaymentOutcomeReactionCapability } from "../logic/payment-outcome-reaction";

const capability = createCommercePaymentOutcomeReactionCapability();

describe("Commerce payment outcome reaction", () => {
  it("owns paid-settlement intent for pending orders", () => {
    expect(capability.plan({ kind: "PAYMENT_PAID", orderStatus: "PENDING", hasPaymentAttempt: true })).toEqual({
      status: "APPLY",
      kind: "PAYMENT_PAID",
      upsertPaymentPaid: true,
      markOrderPaid: true,
      markAttemptCompleted: true,
      finalizeInvoice: true,
      applyOfferRedemption: true,
      issueEntitlements: true,
      emailTypes: ["ORDER_CONFIRMED", "INVOICE_READY", "LICENSES_READY"],
      auditAction: "PAYMENT_SETTLED",
    });
  });

  it("preserves settlement after local cancellation", () => {
    expect(capability.plan({ kind: "PAYMENT_PAID", orderStatus: "CANCELLED", hasPaymentAttempt: false })).toEqual({
      status: "APPLY",
      kind: "PAYMENT_PAID",
      upsertPaymentPaid: true,
      markOrderPaid: true,
      markAttemptCompleted: false,
      finalizeInvoice: true,
      applyOfferRedemption: true,
      issueEntitlements: true,
      emailTypes: ["ORDER_CONFIRMED", "INVOICE_READY", "LICENSES_READY"],
      auditAction: "PAYMENT_SETTLED_AFTER_LOCAL_CANCELLATION",
    });
  });

  it("does not re-settle orders outside pending/cancelled", () => {
    expect(capability.plan({ kind: "PAYMENT_PAID", orderStatus: "PAID", hasPaymentAttempt: true })).toEqual({
      status: "NOOP",
      reason: "ORDER_NOT_SETTLEMENT_MUTABLE",
    });
    expect(capability.plan({ kind: "PAYMENT_PAID", orderStatus: "REFUNDED", hasPaymentAttempt: true })).toEqual({
      status: "NOOP",
      reason: "ORDER_NOT_SETTLEMENT_MUTABLE",
    });
  });

  it("owns failed-payment mutation intent for pending and cancelled orders", () => {
    expect(capability.plan({ kind: "PAYMENT_FAILED", orderStatus: "PENDING", hasExternalPaymentId: true })).toEqual({
      status: "APPLY",
      kind: "PAYMENT_FAILED",
      markPaymentFailed: true,
      markAttemptFailed: true,
      emailType: "PAYMENT_FAILED",
      auditAction: "PAYMENT_FAILED",
    });
    expect(capability.plan({ kind: "PAYMENT_FAILED", orderStatus: "CANCELLED", hasExternalPaymentId: false })).toMatchObject({
      status: "APPLY",
      kind: "PAYMENT_FAILED",
      markPaymentFailed: false,
    });
  });

  it("does not mutate failed-payment state after a commercial order leaves pending/cancelled", () => {
    expect(capability.plan({ kind: "PAYMENT_FAILED", orderStatus: "PAID", hasExternalPaymentId: true })).toEqual({
      status: "NOOP",
      reason: "ORDER_NOT_FAILURE_MUTABLE",
    });
  });

  it("maps non-terminal refund updates onto refund-operation state only", () => {
    expect(capability.plan({ kind: "REFUND_UPDATED", orderStatus: "PAID", refundStatus: "pending", hasExternalRefundId: true })).toEqual({
      status: "APPLY",
      kind: "REFUND_PENDING",
      refundOperationStatus: "PENDING",
      refundOperationErrorCode: null,
    });
    expect(capability.plan({ kind: "REFUND_UPDATED", orderStatus: "PAID", refundStatus: "failed", hasExternalRefundId: true })).toEqual({
      status: "APPLY",
      kind: "REFUND_FAILED",
      refundOperationStatus: "FAILED",
      refundOperationErrorCode: "PAYMENT_REFUND_NOT_ALLOWED",
    });
  });

  it("treats a repeated succeeded refund as idempotent", () => {
    expect(capability.plan({ kind: "REFUND_UPDATED", orderStatus: "REFUNDED", refundStatus: "succeeded", hasExternalRefundId: true })).toEqual({
      status: "NOOP",
      reason: "ALREADY_REFUNDED",
    });
  });

  it("rejects succeeded refunds against incompatible commercial state", () => {
    expect(capability.plan({ kind: "REFUND_UPDATED", orderStatus: "PENDING", refundStatus: "succeeded", hasExternalRefundId: true })).toEqual({
      status: "REJECTED",
      code: "PAYMENT_REFUND_CONFLICT",
    });
  });

  it("owns the full commercial + external revocation intent for a succeeded refund", () => {
    expect(capability.plan({ kind: "REFUND_UPDATED", orderStatus: "PAID", refundStatus: "succeeded", hasExternalRefundId: true })).toEqual({
      status: "APPLY",
      kind: "REFUND_SUCCEEDED",
      markPaymentsRefunded: true,
      markOrderRefunded: true,
      voidInvoice: true,
      markOfferRedemptionsRefunded: true,
      completeRefundOperation: true,
      revokeLicensing: true,
      cancelSubscriptions: true,
      emailType: "REFUND_CONFIRMED",
      auditAction: "PAYMENT_REFUND_CONFIRMED",
    });
  });
});

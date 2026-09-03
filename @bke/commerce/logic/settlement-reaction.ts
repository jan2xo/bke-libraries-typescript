import type {
  CommerceReactToSettlementInput,
  CommerceReactToSettlementResult,
  CommerceSettlementReactionCapability,
} from "../contracts/settlement-reaction.contract";
import type {
  CommerceEntitlementGranter,
  CommercePaymentsSettlementReconciler,
} from "./settlement-reaction-ports";
import type { CommerceSettlementReactionRepository } from "./settlement-reaction-repository";

export function createCommerceSettlementReactionCapability(dependencies: {
  readonly payments: CommercePaymentsSettlementReconciler;
  readonly repository: CommerceSettlementReactionRepository;
  readonly entitlements: CommerceEntitlementGranter;
}): CommerceSettlementReactionCapability {
  return Object.freeze({
    async react(input: CommerceReactToSettlementInput): Promise<CommerceReactToSettlementResult> {
      if (!input.providerEventRecordId.trim()) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      const settlement = await dependencies.payments.reconcile(input);
      if (settlement.status === "REJECTED") {
        return { status: "REJECTED", code: "PAYMENT_EVENT_REJECTED" };
      }
      if (settlement.status === "FAILED") {
        return { status: "FAILED", code: "PAYMENTS_UNAVAILABLE" };
      }

      let commercial;
      try {
        commercial = await dependencies.repository.settle({
          orderId: settlement.value.commercialReference,
          expectedAmountMinor: settlement.value.amountMinor,
          expectedCurrency: settlement.value.currency,
          settledAt: settlement.value.settledAt,
        });
      } catch {
        return { status: "FAILED", code: "COMMERCE_PERSISTENCE_UNAVAILABLE" };
      }

      if (commercial.status === "REJECTED") {
        return { status: "REJECTED", code: commercial.code };
      }

      let entitlementCount = 0;
      for (const item of commercial.value.items) {
        const resourceId = item.editionId ?? item.productId;
        const sourceReference = `commerce:${commercial.value.orderId}:${item.orderItemId}`;
        const result = await dependencies.entitlements.grant({
          subjectId: commercial.value.accountId,
          resourceId,
          sourceReference,
          quantity: item.quantity,
          scopeSnapshot: item.entitlementSnapshot ?? item.policySnapshot,
          grantSnapshot: {
            source: "commerce-settlement",
            orderId: commercial.value.orderId,
            orderItemId: item.orderItemId,
            settlementFactId: settlement.value.settlementFactId,
            productId: item.productId,
            editionId: item.editionId,
          },
          validFrom: settlement.value.settledAt,
        });

        if (result.status === "REJECTED") {
          return { status: "REJECTED", code: "ENTITLEMENT_CONFLICT" };
        }
        if (result.status === "FAILED") {
          return { status: "FAILED", code: "ENTITLEMENTS_UNAVAILABLE" };
        }
        entitlementCount += 1;
      }

      return {
        status: "FULFILLED",
        value: {
          orderId: commercial.value.orderId,
          invoiceId: commercial.value.invoiceId,
          orderStatus: "PAID",
          invoiceStatus: "FINAL",
          settlementFactId: settlement.value.settlementFactId,
          entitlementCount,
        },
      };
    },
  });
}

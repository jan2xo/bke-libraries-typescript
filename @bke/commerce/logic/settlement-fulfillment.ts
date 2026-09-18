import type {
  CommerceReactToSettlementFulfillmentInput,
  CommerceReactToSettlementFulfillmentResult,
  CommerceSettlementFulfillmentCapability,
} from "../contracts/settlement-fulfillment.contract";
import type {
  CommerceClaimUnitIssuer,
  CommerceEntitlementGranter,
  CommercePaymentsSettlementReconciler,
} from "./settlement-fulfillment-ports";
import type { CommerceSettlementFulfillmentRepository } from "./settlement-fulfillment-repository";

export function createCommerceSettlementFulfillmentCapability(dependencies: {
  readonly payments: CommercePaymentsSettlementReconciler;
  readonly repository: CommerceSettlementFulfillmentRepository;
  readonly entitlements: CommerceEntitlementGranter;
  readonly claimUnits: CommerceClaimUnitIssuer;
}): CommerceSettlementFulfillmentCapability {
  return Object.freeze({
    async react(
      input: CommerceReactToSettlementFulfillmentInput,
    ): Promise<CommerceReactToSettlementFulfillmentResult> {
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

      if (commercial.status === "REJECTED") return commercial;

      let entitlementCount = 0;
      let claimUnitCount = 0;

      if (commercial.value.fulfillmentMode === "ACCOUNT_ENTITLEMENT") {
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
      } else {
        for (const item of commercial.value.items) {
          const result = await dependencies.claimUnits.issue({
            purchaserAccountId: commercial.value.accountId,
            orderId: commercial.value.orderId,
            orderItemId: item.orderItemId,
            productId: item.productId,
            editionId: item.editionId,
            purchasePlanId: item.purchasePlanId,
            resourceId: item.editionId ?? item.productId,
            quantity: item.quantity,
            scopeSnapshot: item.entitlementSnapshot ?? item.policySnapshot,
            grantSnapshot: {
              source: "commerce-settlement-claim",
              orderId: commercial.value.orderId,
              orderItemId: item.orderItemId,
              settlementFactId: settlement.value.settlementFactId,
              productId: item.productId,
              editionId: item.editionId,
              purchasePlanId: item.purchasePlanId,
            },
            validFrom: settlement.value.settledAt,
          });
          if (result.status === "REJECTED") {
            return { status: "REJECTED", code: "CLAIM_UNIT_CONFLICT" };
          }
          if (result.status === "FAILED") {
            return { status: "FAILED", code: "CLAIM_UNITS_UNAVAILABLE" };
          }
          claimUnitCount += result.unitCount;
        }
      }

      return {
        status: "FULFILLED",
        value: {
          orderId: commercial.value.orderId,
          invoiceId: commercial.value.invoiceId,
          orderStatus: "PAID",
          invoiceStatus: "FINAL",
          settlementDisposition: commercial.value.settlementDisposition,
          settlementFactId: settlement.value.settlementFactId,
          fulfillmentMode: commercial.value.fulfillmentMode,
          entitlementCount,
          claimUnitCount,
        },
      };
    },
  });
}

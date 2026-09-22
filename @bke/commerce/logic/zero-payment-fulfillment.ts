import type {
  CommerceFulfillZeroPaymentInput,
  CommerceFulfillZeroPaymentResult,
  CommerceZeroPaymentFulfillmentCapability,
} from "../contracts/zero-payment-fulfillment.contract";
import type {
  CommerceClaimUnitIssuer,
  CommerceEntitlementGranter,
} from "./settlement-fulfillment-ports";
import type { CommerceZeroPaymentFulfillmentRepository } from "./zero-payment-fulfillment-repository";

export function createCommerceZeroPaymentFulfillmentCapability(dependencies: {
  readonly repository: CommerceZeroPaymentFulfillmentRepository;
  readonly entitlements: CommerceEntitlementGranter;
  readonly claimUnits?: CommerceClaimUnitIssuer;
}): CommerceZeroPaymentFulfillmentCapability {
  return Object.freeze({
    async fulfill(input: CommerceFulfillZeroPaymentInput): Promise<CommerceFulfillZeroPaymentResult> {
      if (
        !input.orderId.trim() ||
        !(input.fulfilledAt instanceof Date) ||
        Number.isNaN(input.fulfilledAt.getTime())
      ) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      let commercial;
      try {
        commercial = await dependencies.repository.fulfill(input);
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
            fulfillmentSnapshot: commercial.value.fulfillmentSnapshot,
            grantSnapshot: {
              source: "commerce-zero-payment",
              orderId: commercial.value.orderId,
              orderItemId: item.orderItemId,
              productId: item.productId,
              editionId: item.editionId,
            },
            validFrom: input.fulfilledAt,
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
        if (!dependencies.claimUnits) {
          return { status: "FAILED", code: "CLAIM_UNITS_UNAVAILABLE" };
        }
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
              source: "commerce-zero-payment-claim",
              orderId: commercial.value.orderId,
              orderItemId: item.orderItemId,
              productId: item.productId,
              editionId: item.editionId,
              purchasePlanId: item.purchasePlanId,
            },
            validFrom: input.fulfilledAt,
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
          fulfillmentMode: commercial.value.fulfillmentMode,
          entitlementCount,
          claimUnitCount,
        },
      };
    },
  });
}

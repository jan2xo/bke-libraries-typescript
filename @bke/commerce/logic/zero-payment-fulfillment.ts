import type {
  CommerceFulfillZeroPaymentInput,
  CommerceFulfillZeroPaymentResult,
  CommerceZeroPaymentFulfillmentCapability,
} from "../contracts/zero-payment-fulfillment.contract";
import type { CommerceEntitlementGranter } from "./settlement-reaction-ports";
import type { CommerceZeroPaymentFulfillmentRepository } from "./zero-payment-fulfillment-repository";

export function createCommerceZeroPaymentFulfillmentCapability(dependencies: {
  readonly repository: CommerceZeroPaymentFulfillmentRepository;
  readonly entitlements: CommerceEntitlementGranter;
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

      return {
        status: "FULFILLED",
        value: {
          orderId: commercial.value.orderId,
          invoiceId: commercial.value.invoiceId,
          orderStatus: "PAID",
          invoiceStatus: "FINAL",
          entitlementCount,
        },
      };
    },
  });
}

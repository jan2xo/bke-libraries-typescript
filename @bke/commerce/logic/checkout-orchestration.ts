import type { CommerceCheckoutOfferPricingCapability } from "../contracts/checkout-offer-pricing.contract";
import type {
  CommerceCheckoutLegalRequirementInput,
  CommerceCheckoutOrchestrationCapability,
  CommerceStartCheckoutInput,
  CommerceStartCheckoutResult,
} from "../contracts/checkout-orchestration.contract";
import type { CommerceOrderInvoiceCreationCapability } from "../contracts/order-invoice-creation.contract";
import type { CommerceZeroPaymentFulfillmentCapability } from "../contracts/zero-payment-fulfillment.contract";
import type {
  CommerceAccountPurchaseAuthorizer,
  CommerceLegalAcceptanceChecker,
  CommercePaymentCheckoutStarter,
} from "./checkout-orchestration-ports";

function validText(value: string): boolean {
  return value.trim().length > 0;
}

function validLegalRequirement(requirement: CommerceCheckoutLegalRequirementInput): boolean {
  return (
    validText(requirement.documentId) &&
    validText(requirement.documentVersionId) &&
    validText(requirement.acceptanceContext) &&
    validText(requirement.slaVersion) &&
    validText(requirement.renderedContentSha256)
  );
}

function validLegalRequirements(requirements: readonly CommerceCheckoutLegalRequirementInput[]): boolean {
  if (requirements.length === 0 || !requirements.every(validLegalRequirement)) return false;
  const documentIds = new Set(requirements.map((requirement) => requirement.documentId));
  const versionIds = new Set(requirements.map((requirement) => requirement.documentVersionId));
  return documentIds.size === requirements.length && versionIds.size === requirements.length;
}

export function createCommerceCheckoutOrchestrationCapability(dependencies: {
  readonly accountAuthorizer: CommerceAccountPurchaseAuthorizer;
  readonly legalChecker: CommerceLegalAcceptanceChecker;
  readonly orderInvoiceCreation: CommerceOrderInvoiceCreationCapability;
  readonly checkoutOfferPricing: CommerceCheckoutOfferPricingCapability;
  readonly zeroPaymentFulfillment: CommerceZeroPaymentFulfillmentCapability;
  readonly paymentStarter: CommercePaymentCheckoutStarter;
}): CommerceCheckoutOrchestrationCapability {
  return Object.freeze({
    async start(input: CommerceStartCheckoutInput): Promise<CommerceStartCheckoutResult> {
      if (
        !validText(input.principalId) ||
        !validText(input.accountId) ||
        !validText(input.paymentSourceReference) ||
        !validText(input.payer.name) ||
        !validText(input.payer.email) ||
        input.order.accountId !== input.accountId ||
        !validLegalRequirements(input.legal) ||
        (input.offerIdentifier !== undefined &&
          input.offerIdentifier !== null &&
          !validText(input.offerIdentifier))
      ) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      const account = await dependencies.accountAuthorizer.authorize({
        principalId: input.principalId,
        accountId: input.accountId,
      });
      if (account.status === "REJECTED") {
        return { status: "REJECTED", code: "ACCOUNT_FORBIDDEN" };
      }
      if (account.status === "FAILED") {
        return { status: "FAILED", code: "ACCOUNT_UNAVAILABLE" };
      }

      for (const requirement of input.legal) {
        const legal = await dependencies.legalChecker.check({
          principalId: input.principalId,
          accountId: input.accountId,
          requirement,
        });
        if (legal.status === "NOT_ACCEPTED") {
          return { status: "REJECTED", code: "LEGAL_NOT_ACCEPTED" };
        }
        if (legal.status === "FAILED") {
          return { status: "FAILED", code: "LEGAL_UNAVAILABLE" };
        }
      }

      const created = await dependencies.orderInvoiceCreation.create(input.order);
      if (created.status === "REJECTED") {
        return { status: "REJECTED", code: "ORDER_CONFLICT" };
      }
      if (created.status === "FAILED") {
        return {
          status: "FAILED",
          code:
            created.code === "INVALID_INPUT"
              ? "INVALID_INPUT"
              : "COMMERCE_PERSISTENCE_UNAVAILABLE",
        };
      }

      const pricing = await dependencies.checkoutOfferPricing.price({
        orderId: created.value.orderId,
        offerIdentifier: input.offerIdentifier,
      });
      if (pricing.status === "REJECTED") {
        if (pricing.code === "ORDER_NOT_FOUND" || pricing.code === "ORDER_NOT_ELIGIBLE") {
          return { status: "REJECTED", code: "ORDER_CONFLICT" };
        }
        return { status: "REJECTED", code: "OFFER_NOT_AVAILABLE" };
      }
      if (pricing.status === "FAILED") {
        return {
          status: "FAILED",
          code:
            pricing.code === "INVALID_INPUT"
              ? "INVALID_INPUT"
              : "COMMERCE_PERSISTENCE_UNAVAILABLE",
        };
      }

      const pricedOrder = Object.freeze({
        ...created.value,
        subtotalMinor: pricing.value.subtotalMinor,
        totalMinor: pricing.value.totalMinor,
      });

      if (pricedOrder.totalMinor === 0) {
        const fulfillment = await dependencies.zeroPaymentFulfillment.fulfill({
          orderId: pricedOrder.orderId,
          fulfilledAt: new Date(),
        });
        if (fulfillment.status === "REJECTED") {
          return {
            status: "REJECTED",
            code:
              fulfillment.code === "ENTITLEMENT_CONFLICT"
                ? "ENTITLEMENT_CONFLICT"
                : "ORDER_CONFLICT",
          };
        }
        if (fulfillment.status === "FAILED") {
          if (fulfillment.code === "INVALID_INPUT") {
            return { status: "FAILED", code: "INVALID_INPUT" };
          }
          return {
            status: "FAILED",
            code:
              fulfillment.code === "ENTITLEMENTS_UNAVAILABLE"
                ? "ENTITLEMENTS_UNAVAILABLE"
                : "COMMERCE_PERSISTENCE_UNAVAILABLE",
          };
        }
        return {
          status: "PAYMENT_NOT_REQUIRED",
          order: pricedOrder,
          fulfillment: fulfillment.value,
          offer: pricing.value.offer,
        };
      }

      const items = pricing.value.offer
        ? [
            {
              name: input.order.lines[0]?.productName ?? "Order",
              description: input.order.lines[0]?.description ?? "Order",
              amountMinor: pricing.value.subtotalMinor,
              quantity: 1,
            },
          ]
        : input.order.lines.map((line) => ({
            name: line.productName,
            description: line.description,
            amountMinor: line.unitAmountMinor,
            quantity: line.quantity,
          }));
      if (input.order.taxMinor > 0) {
        items.push({
          name: "Tax",
          description: "Order tax",
          amountMinor: input.order.taxMinor,
          quantity: 1,
        });
      }

      const payment = await dependencies.paymentStarter.create({
        sourceReference: input.paymentSourceReference,
        commercialReference: pricedOrder.orderId,
        amountMinor: pricedOrder.totalMinor,
        currency: pricedOrder.currency,
        payer: input.payer,
        items,
      });

      if (payment.status === "REJECTED") {
        return { status: "REJECTED", code: "PAYMENT_SOURCE_CONFLICT" };
      }
      if (payment.status === "FAILED") {
        if (payment.code === "INVALID_INPUT") {
          return { status: "FAILED", code: "INVALID_INPUT" };
        }
        if (payment.code === "PERSISTENCE_UNAVAILABLE") {
          return { status: "FAILED", code: "PAYMENTS_UNAVAILABLE" };
        }
        return {
          status: "FAILED",
          code:
            payment.code === "PROVIDER_UNAVAILABLE"
              ? "PAYMENT_PROVIDER_UNAVAILABLE"
              : "PAYMENT_PROVIDER_REJECTED",
        };
      }

      return {
        status: "PAYMENT_READY",
        order: pricedOrder,
        payment: payment.value,
        offer: pricing.value.offer,
      };
    },
  });
}

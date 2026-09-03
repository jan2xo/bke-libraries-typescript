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
        !validLegalRequirements(input.legal)
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

      if (created.value.totalMinor === 0) {
        const fulfillment = await dependencies.zeroPaymentFulfillment.fulfill({
          orderId: created.value.orderId,
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
          order: created.value,
          fulfillment: fulfillment.value,
        };
      }

      const items = input.order.lines.map((line) => ({
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
        commercialReference: created.value.orderId,
        amountMinor: created.value.totalMinor,
        currency: created.value.currency,
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
        order: created.value,
        payment: payment.value,
      };
    },
  });
}

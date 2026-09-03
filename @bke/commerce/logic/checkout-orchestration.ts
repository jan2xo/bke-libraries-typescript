import type {
  CommerceCheckoutOrchestrationCapability,
  CommerceStartCheckoutInput,
  CommerceStartCheckoutResult,
} from "../contracts/checkout-orchestration.contract";
import type { CommerceOrderInvoiceCreationCapability } from "../contracts/order-invoice-creation.contract";
import type {
  CommerceAccountPurchaseAuthorizer,
  CommerceLegalAcceptanceChecker,
  CommercePaymentCheckoutStarter,
} from "./checkout-orchestration-ports";

function validText(value: string): boolean {
  return value.trim().length > 0;
}

export function createCommerceCheckoutOrchestrationCapability(dependencies: {
  readonly accountAuthorizer: CommerceAccountPurchaseAuthorizer;
  readonly legalChecker: CommerceLegalAcceptanceChecker;
  readonly orderInvoiceCreation: CommerceOrderInvoiceCreationCapability;
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
        input.order.accountId !== input.accountId
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

      const legal = await dependencies.legalChecker.check({
        principalId: input.principalId,
        accountId: input.accountId,
        requirement: input.legal,
      });
      if (legal.status === "NOT_ACCEPTED") {
        return { status: "REJECTED", code: "LEGAL_NOT_ACCEPTED" };
      }
      if (legal.status === "FAILED") {
        return { status: "FAILED", code: "LEGAL_UNAVAILABLE" };
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
        return { status: "PAYMENT_NOT_REQUIRED", order: created.value };
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

import type { CommerceCheckoutOfferPricingCapability, CommerceCheckoutOfferSnapshot } from "../contracts/checkout-offer-pricing.contract";
import type {
  CommerceCheckoutLegalRequirementInput,
  CommerceCheckoutOrchestrationCapability,
  CommerceStartCheckoutInput,
  CommerceStartCheckoutResult,
} from "../contracts/checkout-orchestration.contract";
import type {
  CommercePaymentIntentCheckoutCapability,
  CommercePaymentIntentCheckoutPolicy,
  CommerceStartPaymentIntentCheckoutInput,
  CommerceStartPaymentIntentCheckoutResult,
  CommerceCheckoutPaymentIntentSnapshot,
  CommercePaymentIntentLifecycle,
} from "../contracts/payment-intent-checkout.contract";
import type { CommerceOrderInvoiceCreationCapability, CommerceOrderInvoiceSnapshot } from "../contracts/order-invoice-creation.contract";
import type { CommerceRenewalCheckoutPricingCapability } from "../contracts/renewal-checkout-pricing.contract";
import type { CommerceZeroPaymentFulfillmentCapability, CommerceZeroPaymentFulfillmentSnapshot } from "../contracts/zero-payment-fulfillment.contract";
import type {
  CommerceAccountPurchaseAuthorizer,
  CommerceLegalAcceptanceChecker,
  CommercePaymentCheckoutStarter,
  CommercePaymentIntentCheckoutStarter,
} from "./checkout-orchestration-ports";

type CheckoutCoordinatorDependencies = {
  readonly accountAuthorizer: CommerceAccountPurchaseAuthorizer;
  readonly legalChecker: CommerceLegalAcceptanceChecker;
  readonly orderInvoiceCreation: CommerceOrderInvoiceCreationCapability;
  readonly renewalCheckoutPricing?: CommerceRenewalCheckoutPricingCapability;
  readonly checkoutOfferPricing: CommerceCheckoutOfferPricingCapability;
  readonly zeroPaymentFulfillment: CommerceZeroPaymentFulfillmentCapability;
};

type CheckoutPreparationInput = Omit<CommerceStartCheckoutInput, "payer">;
type PreparedPayment = {
  readonly sourceReference: string;
  readonly commercialReference: string;
  readonly amountMinor: number;
  readonly currency: string;
};
type CheckoutPreparationResult =
  | {
      readonly status: "PAYMENT_REQUIRED";
      readonly order: CommerceOrderInvoiceSnapshot;
      readonly payment: PreparedPayment;
      readonly items: readonly { readonly name: string; readonly description?: string; readonly amountMinor: number; readonly quantity: number }[];
      readonly offer: CommerceCheckoutOfferSnapshot | null;
    }
  | {
      readonly status: "PAYMENT_NOT_REQUIRED";
      readonly order: CommerceOrderInvoiceSnapshot;
      readonly fulfillment: CommerceZeroPaymentFulfillmentSnapshot;
      readonly offer: CommerceCheckoutOfferSnapshot | null;
    }
  | {
      readonly status: "REJECTED";
      readonly code:
        | "ACCOUNT_FORBIDDEN"
        | "LEGAL_NOT_ACCEPTED"
        | "ORDER_CONFLICT"
        | "OFFER_NOT_AVAILABLE"
        | "ENTITLEMENT_CONFLICT"
        | "CLAIM_UNIT_CONFLICT";
    }
  | {
      readonly status: "FAILED";
      readonly code:
        | "INVALID_INPUT"
        | "ACCOUNT_UNAVAILABLE"
        | "LEGAL_UNAVAILABLE"
        | "COMMERCE_PERSISTENCE_UNAVAILABLE"
        | "ENTITLEMENTS_UNAVAILABLE"
        | "CLAIM_UNITS_UNAVAILABLE";
    };

function validText(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
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
  if (!requirements.length || !requirements.every(validLegalRequirement)) return false;
  const documentIds = new Set(requirements.map((requirement) => requirement.documentId));
  const versionIds = new Set(requirements.map((requirement) => requirement.documentVersionId));
  return documentIds.size === requirements.length && versionIds.size === requirements.length;
}

/** Shared, side-effect-owning checkout pipeline. Payment mechanisms only run after this returns PAYMENT_REQUIRED. */
async function prepareCheckout(
  dependencies: CheckoutCoordinatorDependencies,
  input: CheckoutPreparationInput,
): Promise<CheckoutPreparationResult> {
  if (
    !validText(input.principalId) ||
    !validText(input.accountId) ||
    !validText(input.paymentSourceReference) ||
    input.order.accountId !== input.accountId ||
    !validLegalRequirements(input.legal) ||
    (input.offerIdentifier !== undefined && input.offerIdentifier !== null && !validText(input.offerIdentifier))
  ) {
    return { status: "FAILED", code: "INVALID_INPUT" };
  }

  const account = await dependencies.accountAuthorizer.authorize({
    principalId: input.principalId,
    accountId: input.accountId,
  });
  if (account.status === "REJECTED") return { status: "REJECTED", code: "ACCOUNT_FORBIDDEN" };
  if (account.status === "FAILED") return { status: "FAILED", code: "ACCOUNT_UNAVAILABLE" };

  for (const requirement of input.legal) {
    const legal = await dependencies.legalChecker.check({
      principalId: input.principalId,
      accountId: input.accountId,
      requirement,
    });
    if (legal.status === "NOT_ACCEPTED") return { status: "REJECTED", code: "LEGAL_NOT_ACCEPTED" };
    if (legal.status === "FAILED") return { status: "FAILED", code: "LEGAL_UNAVAILABLE" };
  }

  const created = await dependencies.orderInvoiceCreation.create(input.order);
  if (created.status === "REJECTED") return { status: "REJECTED", code: "ORDER_CONFLICT" };
  if (created.status === "FAILED") {
    return {
      status: "FAILED",
      code: created.code === "INVALID_INPUT" ? "INVALID_INPUT" : "COMMERCE_PERSISTENCE_UNAVAILABLE",
    };
  }

  const renewal = dependencies.renewalCheckoutPricing
    ? await dependencies.renewalCheckoutPricing.prepare({ orderId: created.value.orderId })
    : ({ status: "READY", renewal: false } as const);
  if (renewal.status === "REJECTED") return { status: "REJECTED", code: "ORDER_CONFLICT" };
  if (renewal.status === "FAILED") {
    return {
      status: "FAILED",
      code: renewal.code === "INVALID_INPUT" ? "INVALID_INPUT" : "COMMERCE_PERSISTENCE_UNAVAILABLE",
    };
  }

  const renewalPriced = renewal.renewal && renewal.scheduledOfferApplied;
  const pricing = renewalPriced
    ? {
        status: "PRICED" as const,
        value: {
          orderId: created.value.orderId,
          subtotalMinor: renewal.subtotalMinor,
          totalMinor: renewal.totalMinor,
          offer: null,
        },
      }
    : await dependencies.checkoutOfferPricing.price({
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
      code: pricing.code === "INVALID_INPUT" ? "INVALID_INPUT" : "COMMERCE_PERSISTENCE_UNAVAILABLE",
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
            : fulfillment.code === "CLAIM_UNIT_CONFLICT"
              ? "CLAIM_UNIT_CONFLICT"
              : "ORDER_CONFLICT",
      };
    }
    if (fulfillment.status === "FAILED") {
      if (fulfillment.code === "INVALID_INPUT") return { status: "FAILED", code: "INVALID_INPUT" };
      return {
        status: "FAILED",
        code:
          fulfillment.code === "ENTITLEMENTS_UNAVAILABLE"
            ? "ENTITLEMENTS_UNAVAILABLE"
            : fulfillment.code === "CLAIM_UNITS_UNAVAILABLE"
              ? "CLAIM_UNITS_UNAVAILABLE"
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

  const items = pricing.value.offer || renewalPriced
    ? [{
        name: input.order.lines[0]?.productName ?? "Order",
        description: input.order.lines[0]?.description ?? "Order",
        amountMinor: pricing.value.subtotalMinor,
        quantity: 1,
      }]
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

  return {
    status: "PAYMENT_REQUIRED",
    order: pricedOrder,
    payment: {
      sourceReference: input.paymentSourceReference,
      commercialReference: pricedOrder.orderId,
      amountMinor: pricedOrder.totalMinor,
      currency: pricedOrder.currency,
    },
    items,
    offer: pricing.value.offer,
  };
}

function validIntentPolicy(policy: CommercePaymentIntentCheckoutPolicy): {
  readonly providerName: string;
  readonly livemode: boolean;
  readonly paymentMethodAllowed: readonly string[];
} {
  if (!policy || typeof policy !== "object" || typeof policy.providerName !== "string" || !policy.providerName.trim() || typeof policy.livemode !== "boolean") {
    throw new Error("COMMERCE_PAYMENT_INTENT_CONFIGURATION_INVALID");
  }
  if (!Array.isArray(policy.paymentMethodAllowed) || policy.paymentMethodAllowed.length === 0 || policy.paymentMethodAllowed.length > 10) {
    throw new Error("COMMERCE_PAYMENT_INTENT_CONFIGURATION_INVALID");
  }
  const methods = policy.paymentMethodAllowed.map((method) =>
    typeof method === "string" ? method.trim().toLowerCase() : "",
  );
  if (methods.some((method) => !/^[a-z][a-z0-9_]{1,31}$/.test(method)) || new Set(methods).size !== methods.length) {
    throw new Error("COMMERCE_PAYMENT_INTENT_CONFIGURATION_INVALID");
  }
  return Object.freeze({
    providerName: policy.providerName.trim().toLowerCase(),
    livemode: policy.livemode,
    paymentMethodAllowed: Object.freeze([...methods].sort()),
  });
}

const paymentIntentStatuses = new Set<CommercePaymentIntentLifecycle>([
  "awaiting_payment_method",
  "awaiting_next_action",
  "processing",
  "succeeded",
  "cancelled",
]);

function validatedPaymentIntent(
  value: CommerceCheckoutPaymentIntentSnapshot,
  expected: {
    readonly sourceReference: string;
    readonly providerName: string;
    readonly amountMinor: number;
    readonly currency: string;
    readonly livemode: boolean;
  },
): CommerceCheckoutPaymentIntentSnapshot | null {
  if (
    !value ||
    !validText(value.attemptId) ||
    !validText(value.sourceReference) ||
    value.sourceReference !== expected.sourceReference ||
    typeof value.provider !== "string" ||
    value.provider.trim().toLowerCase() !== expected.providerName ||
    !validText(value.paymentIntentId) ||
    !validText(value.clientKey) ||
    !paymentIntentStatuses.has(value.status) ||
    !Number.isSafeInteger(value.amountMinor) ||
    value.amountMinor !== expected.amountMinor ||
    typeof value.currency !== "string" ||
    value.currency.trim().toUpperCase() !== expected.currency.trim().toUpperCase() ||
    value.livemode !== expected.livemode ||
    !(value.createdAt instanceof Date) ||
    !Number.isFinite(value.createdAt.getTime()) ||
    (value.qrImageUrl !== undefined && !validText(value.qrImageUrl)) ||
    (value.redirectUrl !== undefined && !validText(value.redirectUrl)) ||
    (value.expiresAt !== undefined &&
      (!(value.expiresAt instanceof Date) || !Number.isFinite(value.expiresAt.getTime())))
  ) {
    return null;
  }
  return Object.freeze({
    attemptId: value.attemptId.trim(),
    sourceReference: value.sourceReference,
    provider: expected.providerName,
    paymentIntentId: value.paymentIntentId.trim(),
    clientKey: value.clientKey,
    status: value.status,
    amountMinor: value.amountMinor,
    currency: value.currency.trim().toUpperCase(),
    livemode: value.livemode,
    createdAt: new Date(value.createdAt),
    ...(value.qrImageUrl === undefined ? {} : { qrImageUrl: value.qrImageUrl.trim() }),
    ...(value.redirectUrl === undefined ? {} : { redirectUrl: value.redirectUrl.trim() }),
    ...(value.expiresAt === undefined ? {} : { expiresAt: new Date(value.expiresAt) }),
  });
}

function paymentIntentFailure(
  code: "INVALID_INPUT" | "MODE_MISMATCH" | "CREATION_DISABLED" | "PERSISTENCE_UNAVAILABLE" |
    "PROVIDER_UNAVAILABLE" | "PROVIDER_REJECTED" | "REQUEST_IN_PROGRESS" | "RECOVERY_REQUIRED" |
    "PAYMENT_INTENT_MISMATCH",
): Extract<CommerceStartPaymentIntentCheckoutResult, { status: "FAILED" }>["code"] {
  switch (code) {
    case "INVALID_INPUT": return "INVALID_INPUT";
    case "MODE_MISMATCH": return "PAYMENT_INTENT_MODE_MISMATCH";
    case "CREATION_DISABLED": return "PAYMENT_INTENT_CREATION_DISABLED";
    case "PERSISTENCE_UNAVAILABLE": return "PAYMENT_INTENT_PERSISTENCE_UNAVAILABLE";
    case "PROVIDER_UNAVAILABLE": return "PAYMENT_INTENT_PROVIDER_UNAVAILABLE";
    case "PROVIDER_REJECTED": return "PAYMENT_INTENT_PROVIDER_REJECTED";
    case "REQUEST_IN_PROGRESS": return "PAYMENT_INTENT_IN_PROGRESS";
    case "RECOVERY_REQUIRED": return "PAYMENT_INTENT_RECOVERY_REQUIRED";
    case "PAYMENT_INTENT_MISMATCH": return "PAYMENT_INTENT_MISMATCH";
    default: {
      const impossible: never = code;
      throw new Error(`Unsupported Payment Intent failure: ${String(impossible)}`);
    }
  }
}

export function createCommerceCheckoutOrchestrationCapability(
  dependencies: CheckoutCoordinatorDependencies & {
    readonly paymentStarter: CommercePaymentCheckoutStarter;
  },
): CommerceCheckoutOrchestrationCapability {
  return Object.freeze({
    async start(input: CommerceStartCheckoutInput): Promise<CommerceStartCheckoutResult> {
      if (!validText(input.payer.name) || !validText(input.payer.email)) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }
      const prepared = await prepareCheckout(dependencies, input);
      if (prepared.status !== "PAYMENT_REQUIRED") return prepared;

      const payment = await dependencies.paymentStarter.create({
        ...prepared.payment,
        payer: input.payer,
        items: prepared.items,
      });
      if (payment.status === "REJECTED") return { status: "REJECTED", code: "PAYMENT_SOURCE_CONFLICT" };
      if (payment.status === "FAILED") {
        if (payment.code === "INVALID_INPUT") return { status: "FAILED", code: "INVALID_INPUT" };
        if (payment.code === "PERSISTENCE_UNAVAILABLE") return { status: "FAILED", code: "PAYMENTS_UNAVAILABLE" };
        return {
          status: "FAILED",
          code: payment.code === "PROVIDER_UNAVAILABLE"
            ? "PAYMENT_PROVIDER_UNAVAILABLE"
            : "PAYMENT_PROVIDER_REJECTED",
        };
      }
      return {
        status: "PAYMENT_READY",
        order: prepared.order,
        payment: payment.value,
        offer: prepared.offer,
      };
    },
  });
}

export function createCommercePaymentIntentCheckoutCapability(
  dependencies: CheckoutCoordinatorDependencies & {
    readonly paymentIntentStarter: CommercePaymentIntentCheckoutStarter;
    readonly policy: CommercePaymentIntentCheckoutPolicy;
  },
): CommercePaymentIntentCheckoutCapability {
  const policy = validIntentPolicy(dependencies.policy);
  return Object.freeze({
    async start(input: CommerceStartPaymentIntentCheckoutInput): Promise<CommerceStartPaymentIntentCheckoutResult> {
      const prepared = await prepareCheckout(dependencies, input);
      if (prepared.status !== "PAYMENT_REQUIRED") return prepared;

      const sourceReference = prepared.payment.sourceReference.trim();
      const result = await dependencies.paymentIntentStarter.create({
        sourceReference,
        commercialReference: prepared.payment.commercialReference,
        amountMinor: prepared.payment.amountMinor,
        currency: prepared.payment.currency,
        livemode: policy.livemode,
        paymentMethodAllowed: policy.paymentMethodAllowed,
      });
      if (result.status === "REJECTED") return { status: "REJECTED", code: "PAYMENT_SOURCE_CONFLICT" };
      if (result.status === "FAILED") return { status: "FAILED", code: paymentIntentFailure(result.code) };

      const paymentIntent = validatedPaymentIntent(result.value, {
        sourceReference,
        providerName: policy.providerName,
        amountMinor: prepared.payment.amountMinor,
        currency: prepared.payment.currency,
        livemode: policy.livemode,
      });
      if (!paymentIntent) return { status: "FAILED", code: "PAYMENT_INTENT_MISMATCH" };

      return {
        status: "PAYMENT_INTENT_READY",
        order: prepared.order,
        paymentIntent,
        offer: prepared.offer,
      };
    },
  });
}

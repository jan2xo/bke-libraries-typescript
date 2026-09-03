import type {
  CommerceOfferRedemptionCapability,
  CommerceOfferRedemptionTransition,
  CommerceReserveOfferRedemptionInput,
  CommerceReserveOfferRedemptionResult,
  CommerceTransitionOfferRedemptionResult,
} from "../contracts/offer-redemption.contract";
import type { CommerceOfferRedemptionRepository } from "./offer-redemption-repository";

export function normalizeCommerceOfferCode(code: string): string {
  return code.trim().toUpperCase();
}

export function calculateCommerceOfferDiscount(input: {
  readonly baseMinor: number;
  readonly discountBps: number;
}): { readonly discountMinor: number; readonly finalMinor: number } {
  const discountMinor = Math.floor((input.baseMinor * input.discountBps) / 10_000);
  return {
    discountMinor,
    finalMinor: input.baseMinor - discountMinor,
  };
}

export function isCommerceOfferRedemptionTransitionAllowed(
  status: "RESERVED" | "APPLIED" | "RELEASED" | "REFUNDED",
  transition: CommerceOfferRedemptionTransition,
): boolean {
  return (
    (status === "RESERVED" && (transition === "APPLY" || transition === "RELEASE")) ||
    (status === "APPLIED" && transition === "REFUND")
  );
}

function isValidId(value: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 256;
}

function isValidOptionalId(value: string | null | undefined): boolean {
  return value === null || value === undefined || isValidId(value);
}

function validateReserveInput(input: CommerceReserveOfferRedemptionInput): boolean {
  const codeNormalized = normalizeCommerceOfferCode(input.code);
  return (
    codeNormalized.length > 0 &&
    codeNormalized.length <= 128 &&
    isValidId(input.accountId) &&
    isValidId(input.orderId) &&
    isValidOptionalId(input.productId) &&
    isValidOptionalId(input.editionId) &&
    isValidOptionalId(input.purchasePlanId) &&
    Number.isSafeInteger(input.baseMinor) &&
    input.baseMinor >= 0 &&
    input.currency.trim().length > 0 &&
    input.currency.trim().length <= 16 &&
    input.pricingVersion.trim().length > 0 &&
    input.pricingVersion.trim().length <= 128
  );
}

export function createCommerceOfferRedemptionCapability(
  repository: CommerceOfferRedemptionRepository,
  now: () => Date = () => new Date(),
): CommerceOfferRedemptionCapability {
  return Object.freeze({
    async reserve(
      input: CommerceReserveOfferRedemptionInput,
    ): Promise<CommerceReserveOfferRedemptionResult> {
      if (!validateReserveInput(input)) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      try {
        return await repository.reserve({
          ...input,
          accountId: input.accountId.trim(),
          orderId: input.orderId.trim(),
          productId: input.productId?.trim() || null,
          editionId: input.editionId?.trim() || null,
          purchasePlanId: input.purchasePlanId?.trim() || null,
          currency: input.currency.trim().toUpperCase(),
          pricingVersion: input.pricingVersion.trim(),
          codeNormalized: normalizeCommerceOfferCode(input.code),
          now: now(),
        });
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },

    async transition(input: {
      readonly redemptionId: string;
      readonly transition: CommerceOfferRedemptionTransition;
    }): Promise<CommerceTransitionOfferRedemptionResult> {
      if (!isValidId(input.redemptionId)) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      try {
        return await repository.transition({
          redemptionId: input.redemptionId.trim(),
          transition: input.transition,
          now: now(),
        });
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}

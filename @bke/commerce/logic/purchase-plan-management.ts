import type {
  CommercePurchasePlanManagementCapability,
  CommercePurchasePlanManagementInput,
  CommercePurchasePlanManagementResult,
  CommerceManagedPurchasePlanSnapshot,
} from "../contracts/purchase-plan-management.contract";

export interface CommercePurchasePlanManagementRepository {
  sync(input: {
    readonly editionId: string;
    readonly perpetual: { readonly active: boolean; readonly amountMinor: number | null };
    readonly monthly: { readonly active: boolean; readonly amountMinor: number | null };
    readonly annual: { readonly active: boolean; readonly discountBps: number; readonly monthlySourceRequired: true };
  }): Promise<readonly CommerceManagedPurchasePlanSnapshot[]>;
}

function validAmount(value: number | undefined): value is number {
  return Number.isSafeInteger(value) && value! >= 100 && value! <= 2_000_000_000;
}

function validDiscount(value: number | undefined): value is number {
  return Number.isSafeInteger(value) && value! >= 0 && value! <= 1_000;
}

export function validatePurchasePlanManagementInput(
  input: CommercePurchasePlanManagementInput,
): Exclude<CommercePurchasePlanManagementResult, { readonly status: "OK" }> | null {
  if (!input.editionId.trim()) return { status: "FAILED", code: "INVALID_INPUT" };
  if (!input.perpetual.enabled && !input.monthly.enabled) return { status: "FAILED", code: "NO_ENABLED_PLAN" };
  if (input.perpetual.enabled && !validAmount(input.perpetual.amountMinor)) return { status: "FAILED", code: "PERPETUAL_AMOUNT_REQUIRED" };
  if (input.monthly.enabled && !validAmount(input.monthly.amountMinor)) return { status: "FAILED", code: "MONTHLY_AMOUNT_REQUIRED" };
  if (input.annual.enabled && !input.monthly.enabled) return { status: "FAILED", code: "ANNUAL_REQUIRES_MONTHLY" };
  if (input.annual.enabled && !validDiscount(input.annual.discountBps)) return { status: "FAILED", code: "ANNUAL_DISCOUNT_REQUIRED" };
  if (input.perpetual.amountMinor !== undefined && !validAmount(input.perpetual.amountMinor)) return { status: "FAILED", code: "INVALID_INPUT" };
  if (input.monthly.amountMinor !== undefined && !validAmount(input.monthly.amountMinor)) return { status: "FAILED", code: "INVALID_INPUT" };
  if (input.annual.discountBps !== undefined && !validDiscount(input.annual.discountBps)) return { status: "FAILED", code: "INVALID_INPUT" };
  return null;
}

export function createCommercePurchasePlanManagementCapability(
  repository: CommercePurchasePlanManagementRepository,
): CommercePurchasePlanManagementCapability {
  return Object.freeze({
    async sync(input: CommercePurchasePlanManagementInput): Promise<CommercePurchasePlanManagementResult> {
      const failure = validatePurchasePlanManagementInput(input);
      if (failure) return failure;
      try {
        const plans = await repository.sync({
          editionId: input.editionId.trim(),
          perpetual: {
            active: input.perpetual.enabled,
            amountMinor: input.perpetual.amountMinor ?? null,
          },
          monthly: {
            active: input.monthly.enabled,
            amountMinor: input.monthly.amountMinor ?? null,
          },
          annual: {
            active: input.annual.enabled,
            discountBps: input.annual.discountBps ?? 0,
            monthlySourceRequired: true,
          },
        });
        return { status: "OK", plans };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}

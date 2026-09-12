import type {
  LicensingEntitlementLicenseSnapshot,
  LicensingEntitlementManagementCapability,
  LicensingEntitlementManagementResult,
  LicensingIssueEntitlementInput,
  LicensingRenewalOperationSnapshot,
  LicensingRenewSubscriptionEntitlementsInput,
} from "../contracts/entitlement-management.contract";

export interface LicensingEntitlementManagementRepository {
  issue(input: {
    readonly publicId: string;
    readonly keyHash: string;
    readonly keyLastFour: string;
    readonly keyCiphertext: string;
    readonly accountId: string;
    readonly orderId: string;
    readonly orderItemId: string;
    readonly productId: string;
    readonly editionId: string | null;
    readonly purchasePlanId: string | null;
    readonly subscriptionId: string | null;
    readonly maxSeats: number;
    readonly maxDevicesPerSeat: number;
    readonly expiresAt: Date | null;
    readonly eventMetadata: unknown;
  }): Promise<LicensingEntitlementLicenseSnapshot>;
  renewSubscription(input: {
    readonly subscriptionId: string;
    readonly orderId: string;
    readonly periodStart: Date;
    readonly periodEnd: Date;
    readonly effectiveAt: Date;
    readonly discountedCycleConsumed: boolean;
    readonly paymentId: string | null;
    readonly paymentEventId: string | null;
  }): Promise<{
    readonly licenses: readonly LicensingEntitlementLicenseSnapshot[];
    readonly renewalOperations: readonly LicensingRenewalOperationSnapshot[];
  }>;
}

const DAY_MS = 86_400_000;

function validId(value: string): boolean {
  return Boolean(value.trim());
}

function validOptionalId(value: string | null | undefined): boolean {
  return value == null || Boolean(value.trim());
}

function validDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function validOptionalDate(value: Date | null | undefined): boolean {
  return value == null || validDate(value);
}

export function licensingInitialExpiration(
  effectiveAt: Date,
  validityDays: number | null | undefined,
): Date | null {
  if (!validityDays) return null;
  return new Date(effectiveAt.getTime() + validityDays * DAY_MS);
}

export function licensingRenewalExpiration(
  currentExpiry: Date | null | undefined,
  effectiveAt: Date,
  durationMs: number,
): Date {
  const base = currentExpiry && currentExpiry.getTime() > effectiveAt.getTime()
    ? currentExpiry
    : effectiveAt;
  return new Date(base.getTime() + durationMs);
}

function validIssue(input: LicensingIssueEntitlementInput): boolean {
  return validId(input.keyMaterial.publicId)
    && validId(input.keyMaterial.keyHash)
    && input.keyMaterial.keyLastFour.trim().length === 4
    && validId(input.keyMaterial.keyCiphertext)
    && validId(input.accountId)
    && validId(input.orderId)
    && validId(input.orderItemId)
    && validId(input.productId)
    && validOptionalId(input.editionId)
    && validOptionalId(input.purchasePlanId)
    && validOptionalId(input.subscriptionId)
    && Number.isSafeInteger(input.maxSeats)
    && input.maxSeats >= 1
    && Number.isSafeInteger(input.maxDevicesPerSeat)
    && input.maxDevicesPerSeat >= 1
    && validOptionalDate(input.expiresAt);
}

function validRenew(input: LicensingRenewSubscriptionEntitlementsInput): boolean {
  return validId(input.subscriptionId)
    && validId(input.orderId)
    && validDate(input.periodStart)
    && validDate(input.periodEnd)
    && validDate(input.effectiveAt)
    && input.periodEnd.getTime() > input.periodStart.getTime()
    && validOptionalId(input.paymentId)
    && validOptionalId(input.paymentEventId);
}

export function createLicensingEntitlementManagementCapability(
  repository: LicensingEntitlementManagementRepository,
): LicensingEntitlementManagementCapability {
  return Object.freeze({
    async issue(input: LicensingIssueEntitlementInput): Promise<LicensingEntitlementManagementResult> {
      if (!validIssue(input)) return { status: "FAILED", code: "INVALID_INPUT" };
      try {
        const license = await repository.issue({
          publicId: input.keyMaterial.publicId.trim(),
          keyHash: input.keyMaterial.keyHash.trim(),
          keyLastFour: input.keyMaterial.keyLastFour.trim(),
          keyCiphertext: input.keyMaterial.keyCiphertext.trim(),
          accountId: input.accountId.trim(),
          orderId: input.orderId.trim(),
          orderItemId: input.orderItemId.trim(),
          productId: input.productId.trim(),
          editionId: input.editionId?.trim() || null,
          purchasePlanId: input.purchasePlanId?.trim() || null,
          subscriptionId: input.subscriptionId?.trim() || null,
          maxSeats: input.maxSeats,
          maxDevicesPerSeat: input.maxDevicesPerSeat,
          expiresAt: input.expiresAt ?? null,
          eventMetadata: input.eventMetadata ?? {},
        });
        return { status: "OK", licenses: [license], renewalOperations: [] };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },

    async renewSubscription(
      input: LicensingRenewSubscriptionEntitlementsInput,
    ): Promise<LicensingEntitlementManagementResult> {
      if (!validRenew(input)) return { status: "FAILED", code: "INVALID_INPUT" };
      try {
        const result = await repository.renewSubscription({
          subscriptionId: input.subscriptionId.trim(),
          orderId: input.orderId.trim(),
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          effectiveAt: input.effectiveAt,
          discountedCycleConsumed: input.discountedCycleConsumed,
          paymentId: input.paymentId?.trim() || null,
          paymentEventId: input.paymentEventId?.trim() || null,
        });
        return { status: "OK", ...result };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}

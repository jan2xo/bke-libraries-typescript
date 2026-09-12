import type {
  CommerceEditionPlanInput,
  CommerceEditionPlanRepository,
  CommerceEditionPlanSelection,
} from "../contracts/edition-plan-management.contract";

const MIN_AMOUNT_MINOR = 100;
const MAX_AMOUNT_MINOR = 2_000_000_000;
const MAX_ANNUAL_DISCOUNT_BPS = 1_000;

function fail(reason: string): never {
  throw new Error(`INVALID_EDITION_PLAN:${reason}`);
}

function requiredTrimmed(value: string, min: number, max: number, reason: string): string {
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) fail(reason);
  return normalized;
}

function optionalTrimmed(value: string | undefined, max: number, reason: string): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (normalized.length > max) fail(reason);
  return normalized || undefined;
}

function assertIntegerInRange(value: number, min: number, max: number, reason: string): void {
  if (!Number.isInteger(value) || value < min || value > max) fail(reason);
}

function assertOptionalAmount(value: number | undefined, reason: string): void {
  if (value === undefined) return;
  assertIntegerInRange(value, MIN_AMOUNT_MINOR, MAX_AMOUNT_MINOR, reason);
}

export function validateCommerceEditionPlanSelection(input: CommerceEditionPlanSelection): void {
  assertOptionalAmount(input.perpetual.amountMinor, "PERPETUAL_AMOUNT");
  assertOptionalAmount(input.monthly.amountMinor, "MONTHLY_AMOUNT");

  if (input.perpetual.enabled && input.perpetual.amountMinor === undefined) fail("PERPETUAL_PRICE_REQUIRED");
  if (input.monthly.enabled && input.monthly.amountMinor === undefined) fail("MONTHLY_PRICE_REQUIRED");
  if (input.annual.enabled && !input.monthly.enabled) fail("ANNUAL_REQUIRES_MONTHLY");
  if (input.annual.enabled && input.annual.discountBps === undefined) fail("ANNUAL_DISCOUNT_REQUIRED");
  if (input.annual.discountBps !== undefined) {
    assertIntegerInRange(input.annual.discountBps, 0, MAX_ANNUAL_DISCOUNT_BPS, "ANNUAL_DISCOUNT");
  }
  if (!input.perpetual.enabled && !input.monthly.enabled) fail("PURCHASE_PLAN_REQUIRED");
}

export function normalizeCommerceEditionPlanInput(input: CommerceEditionPlanInput): CommerceEditionPlanInput {
  const name = requiredTrimmed(input.name, 2, 100, "NAME");
  const slug = requiredTrimmed(input.slug, 1, 80, "SLUG");
  if (!/^[a-z0-9-]+$/.test(slug)) fail("SLUG");
  const description = optionalTrimmed(input.description, 2_000, "DESCRIPTION");
  if (input.features.length > 100) fail("FEATURE_COUNT");
  const features = input.features.map((feature) => requiredTrimmed(feature, 1, 120, "FEATURE"));
  assertIntegerInRange(input.maxUsers, 1, 10_000, "MAX_USERS");
  assertIntegerInRange(input.maxDevicesPerUser, 1, 100, "MAX_DEVICES_PER_USER");
  if (!["LIFETIME", "ACTIVE_TERM", "MAJOR_VERSION"].includes(input.updatePolicy)) fail("UPDATE_POLICY");
  validateCommerceEditionPlanSelection(input.plans);

  return {
    ...input,
    name,
    slug,
    description,
    features,
  };
}

export async function synchronizeCommerceEditionPlans(
  repository: CommerceEditionPlanRepository,
  editionId: string,
  input: CommerceEditionPlanSelection,
) {
  validateCommerceEditionPlanSelection(input);

  const perpetual = await repository.upsertPurchasePlan({
    editionId,
    type: "PERPETUAL",
    amountMinor: input.perpetual.amountMinor ?? MIN_AMOUNT_MINOR,
    annualDiscountBps: null,
    monthlySourcePlanId: null,
    renewalBehavior: "NONE",
    active: input.perpetual.enabled,
  });

  const monthly = await repository.upsertPurchasePlan({
    editionId,
    type: "MONTHLY",
    amountMinor: input.monthly.amountMinor ?? MIN_AMOUNT_MINOR,
    annualDiscountBps: null,
    monthlySourcePlanId: null,
    renewalBehavior: "CUSTOMER_AUTHORIZED",
    active: input.monthly.enabled,
  });

  const annual = await repository.upsertPurchasePlan({
    editionId,
    type: "ANNUAL",
    amountMinor: null,
    annualDiscountBps: input.annual.discountBps ?? 0,
    monthlySourcePlanId: monthly.id,
    renewalBehavior: "CUSTOMER_AUTHORIZED",
    active: input.annual.enabled,
  });

  return { perpetual, monthly, annual } as const;
}

export async function createCommerceEdition(
  repository: CommerceEditionPlanRepository,
  productId: string,
  input: CommerceEditionPlanInput,
) {
  const normalized = normalizeCommerceEditionPlanInput(input);
  const edition = await repository.createEdition({
    productId,
    name: normalized.name,
    slug: normalized.slug,
    description: normalized.description,
    features: normalized.features,
    maxUsers: normalized.maxUsers,
    maxDevicesPerUser: normalized.maxDevicesPerUser,
    updatePolicy: normalized.updatePolicy,
    active: normalized.active,
  });
  const plans = await synchronizeCommerceEditionPlans(repository, edition.id, normalized.plans);
  return { edition, plans } as const;
}

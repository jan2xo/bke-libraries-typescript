export const COMMERCE_EDITION_PLAN_MANAGEMENT_CAPABILITY_ID = "commerce.edition-plan-management.v1" as const;

export type CommerceUpdatePolicy = "LIFETIME" | "ACTIVE_TERM" | "MAJOR_VERSION";
export type CommerceRenewalBehavior = "NONE" | "CUSTOMER_AUTHORIZED";
export type CommercePurchasePlanKind = "PERPETUAL" | "MONTHLY" | "ANNUAL";

export type CommerceEditionPlanSelection = Readonly<{
  perpetual: Readonly<{ enabled: boolean; amountMinor?: number }>;
  monthly: Readonly<{ enabled: boolean; amountMinor?: number }>;
  annual: Readonly<{ enabled: boolean; discountBps?: number }>;
}>;

export type CommerceEditionPlanInput = Readonly<{
  name: string;
  slug: string;
  description?: string;
  features: readonly string[];
  maxUsers: number;
  maxDevicesPerUser: number;
  updatePolicy: CommerceUpdatePolicy;
  active: boolean;
  plans: CommerceEditionPlanSelection;
}>;

export type CommerceEditionRecord = Readonly<{ id: string }>;
export type CommercePurchasePlanRecord = Readonly<{ id: string }>;

export type CommerceEditionPlanRepository = Readonly<{
  createEdition(input: Readonly<{
    productId: string;
    name: string;
    slug: string;
    description?: string;
    features: readonly string[];
    maxUsers: number;
    maxDevicesPerUser: number;
    updatePolicy: CommerceUpdatePolicy;
    active: boolean;
  }>): Promise<CommerceEditionRecord>;
  upsertPurchasePlan(input: Readonly<{
    editionId: string;
    type: CommercePurchasePlanKind;
    amountMinor: number | null;
    annualDiscountBps: number | null;
    monthlySourcePlanId: string | null;
    renewalBehavior: CommerceRenewalBehavior;
    active: boolean;
  }>): Promise<CommercePurchasePlanRecord>;
}>;

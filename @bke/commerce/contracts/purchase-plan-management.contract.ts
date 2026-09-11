import type {
  CommercePurchasePlanSnapshot,
  CommercePurchasePlanType,
} from "./purchase-plan-pricing.contract";

export const COMMERCE_PURCHASE_PLAN_MANAGEMENT_CAPABILITY_ID =
  "bke.commerce.purchase-plan-management.v1" as const;

export interface CommercePurchasePlanManagementInput {
  readonly editionId: string;
  readonly perpetual: {
    readonly enabled: boolean;
    readonly amountMinor?: number;
  };
  readonly monthly: {
    readonly enabled: boolean;
    readonly amountMinor?: number;
  };
  readonly annual: {
    readonly enabled: boolean;
    readonly discountBps?: number;
  };
}

export interface CommerceManagedPurchasePlanSnapshot extends CommercePurchasePlanSnapshot {
  readonly editionId: string;
  readonly type: CommercePurchasePlanType;
  readonly active: boolean;
}

export type CommercePurchasePlanManagementFailureCode =
  | "INVALID_INPUT"
  | "PERPETUAL_AMOUNT_REQUIRED"
  | "MONTHLY_AMOUNT_REQUIRED"
  | "ANNUAL_REQUIRES_MONTHLY"
  | "ANNUAL_DISCOUNT_REQUIRED"
  | "NO_ENABLED_PLAN"
  | "PERSISTENCE_UNAVAILABLE";

export type CommercePurchasePlanManagementResult =
  | {
      readonly status: "OK";
      readonly plans: readonly CommerceManagedPurchasePlanSnapshot[];
    }
  | {
      readonly status: "FAILED";
      readonly code: CommercePurchasePlanManagementFailureCode;
    };

export interface CommercePurchasePlanManagementCapability {
  sync(input: CommercePurchasePlanManagementInput): Promise<CommercePurchasePlanManagementResult>;
}

import type {
  CommerceEntitlementGranter,
  CommercePaymentsSettlementReconciler,
} from "./settlement-reaction-ports";

export type { CommerceEntitlementGranter, CommercePaymentsSettlementReconciler };

export interface CommerceClaimUnitIssueInput {
  readonly purchaserAccountId: string;
  readonly orderId: string;
  readonly orderItemId: string;
  readonly productId: string;
  readonly editionId: string | null;
  readonly purchasePlanId: string | null;
  readonly resourceId: string;
  readonly quantity: number;
  readonly scopeSnapshot: unknown;
  readonly grantSnapshot: unknown;
  readonly validFrom: Date;
}

export interface CommerceClaimUnitIssuer {
  issue(input: CommerceClaimUnitIssueInput): Promise<
    | { readonly status: "ISSUED" | "EXISTING"; readonly unitCount: number }
    | { readonly status: "REJECTED" }
    | { readonly status: "FAILED" }
  >;
}

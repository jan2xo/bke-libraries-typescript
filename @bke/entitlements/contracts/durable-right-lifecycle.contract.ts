import type {
  EntitlementsDurableRightSnapshot,
  EntitlementsDurableRightStatus,
} from "./durable-right-grant.contract";

export const ENTITLEMENTS_DURABLE_RIGHT_LIFECYCLE_CAPABILITY_ID =
  "bke.entitlements.durable-right-lifecycle.v1" as const;

export type EntitlementsDurableRightLifecycleTargetStatus =
  | "ACTIVE"
  | "SUSPENDED"
  | "REVOKED";

export interface EntitlementsTransitionDurableRightInput {
  readonly entitlementId: string;
  readonly targetStatus: EntitlementsDurableRightLifecycleTargetStatus;
  readonly reason: string;
  readonly changedAt: Date;
}

export type EntitlementsTransitionDurableRightResult =
  | { readonly status: "UPDATED"; readonly value: EntitlementsDurableRightSnapshot }
  | { readonly status: "UNCHANGED"; readonly value: EntitlementsDurableRightSnapshot }
  | {
      readonly status: "REJECTED";
      readonly code: "NOT_FOUND" | "INVALID_TRANSITION";
      readonly currentStatus?: EntitlementsDurableRightStatus;
    }
  | {
      readonly status: "FAILED";
      readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE";
    };

export interface EntitlementsDurableRightLifecycleCapability {
  transition(
    input: EntitlementsTransitionDurableRightInput,
  ): Promise<EntitlementsTransitionDurableRightResult>;
}

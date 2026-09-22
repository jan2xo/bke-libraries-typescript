import type {
  EntitlementsDurableRightSnapshot,
  EntitlementsDurableRightStatus,
} from "../contracts/durable-right-grant.contract";
import type {
  EntitlementsDurableRightLifecycleTargetStatus,
  EntitlementsTransitionDurableRightInput,
} from "../contracts/durable-right-lifecycle.contract";

export type EntitlementsDurableRightLifecycleRepositoryResult =
  | { readonly status: "UPDATED"; readonly value: EntitlementsDurableRightSnapshot }
  | { readonly status: "UNCHANGED"; readonly value: EntitlementsDurableRightSnapshot }
  | {
      readonly status: "REJECTED";
      readonly code: "NOT_FOUND" | "INVALID_TRANSITION";
      readonly currentStatus?: EntitlementsDurableRightStatus;
    };

export interface EntitlementsDurableRightLifecycleRepository {
  transition(
    input: EntitlementsTransitionDurableRightInput & {
      readonly allowedFromStatuses: readonly EntitlementsDurableRightStatus[];
      readonly targetStatus: EntitlementsDurableRightLifecycleTargetStatus;
    },
  ): Promise<EntitlementsDurableRightLifecycleRepositoryResult>;
}

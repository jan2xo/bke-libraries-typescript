import type {
  EntitlementsDurableRightStatus,
} from "../contracts/durable-right-grant.contract";
import type {
  EntitlementsDurableRightLifecycleCapability,
  EntitlementsDurableRightLifecycleTargetStatus,
  EntitlementsTransitionDurableRightInput,
  EntitlementsTransitionDurableRightResult,
} from "../contracts/durable-right-lifecycle.contract";
import type {
  EntitlementsDurableRightLifecycleRepository,
} from "./durable-right-lifecycle-repository";

const transitionSources: Readonly<
  Record<EntitlementsDurableRightLifecycleTargetStatus, readonly EntitlementsDurableRightStatus[]>
> = Object.freeze({
  ACTIVE: Object.freeze(["SUSPENDED"] as const),
  SUSPENDED: Object.freeze(["ACTIVE"] as const),
  REVOKED: Object.freeze(["ACTIVE", "SUSPENDED"] as const),
});

function validText(value: string, max: number): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= max;
}

function validDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

export function createEntitlementsDurableRightLifecycleCapability(
  repository: EntitlementsDurableRightLifecycleRepository,
): EntitlementsDurableRightLifecycleCapability {
  return Object.freeze({
    async transition(
      input: EntitlementsTransitionDurableRightInput,
    ): Promise<EntitlementsTransitionDurableRightResult> {
      if (
        !validText(input.entitlementId, 256) ||
        !validText(input.reason, 128) ||
        !validDate(input.changedAt)
      ) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      try {
        return await repository.transition({
          entitlementId: input.entitlementId.trim(),
          targetStatus: input.targetStatus,
          reason: input.reason.trim(),
          changedAt: new Date(input.changedAt.getTime()),
          allowedFromStatuses: transitionSources[input.targetStatus],
        });
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}

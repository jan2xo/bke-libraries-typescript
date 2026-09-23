import type {
  EntitlementsDurableRightRevocationCapability,
  EntitlementsRevokeDurableRightInput,
  EntitlementsRevokeDurableRightResult,
} from "../contracts/durable-right-revocation.contract";
import type { EntitlementsDurableRightRevocationRepository } from "./durable-right-revocation-repository";

function validText(value: string, max = 512): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= max;
}

function validDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function isJsonValue(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(value as Record<string, unknown>).every(isJsonValue);
}

function validInput(input: EntitlementsRevokeDurableRightInput): boolean {
  return (
    validText(input.entitlementId, 256) &&
    validText(input.revocationReference) &&
    isJsonValue(input.revocationSnapshot) &&
    validDate(input.revokedAt)
  );
}

export function createEntitlementsDurableRightRevocationCapability(
  repository: EntitlementsDurableRightRevocationRepository,
): EntitlementsDurableRightRevocationCapability {
  return Object.freeze({
    async revoke(
      input: EntitlementsRevokeDurableRightInput,
    ): Promise<EntitlementsRevokeDurableRightResult> {
      if (!validInput(input)) return { status: "FAILED", code: "INVALID_INPUT" };

      try {
        return await repository.revoke({
          entitlementId: input.entitlementId.trim(),
          revocationReference: input.revocationReference.trim(),
          revocationSnapshot: input.revocationSnapshot,
          revokedAt: new Date(input.revokedAt.getTime()),
        });
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}

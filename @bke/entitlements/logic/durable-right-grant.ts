import type {
  EntitlementsDurableRightGrantCapability,
  EntitlementsGrantDurableRightInput,
  EntitlementsGrantDurableRightResult,
} from "../contracts/durable-right-grant.contract";
import type { EntitlementsDurableRightGrantRepository } from "./durable-right-grant-repository";

function validText(value: string, max = 256): boolean {
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

function validateInput(input: EntitlementsGrantDurableRightInput): boolean {
  if (
    !validText(input.subjectId) ||
    !validText(input.resourceId) ||
    !validText(input.sourceReference, 512) ||
    !Number.isSafeInteger(input.quantity) ||
    input.quantity <= 0 ||
    !isJsonValue(input.scopeSnapshot) ||
    !isJsonValue(input.grantSnapshot) ||
    !validDate(input.validFrom)
  ) {
    return false;
  }

  if (input.validUntil !== null && input.validUntil !== undefined) {
    if (!validDate(input.validUntil) || input.validUntil.getTime() <= input.validFrom.getTime()) {
      return false;
    }
  }

  return true;
}

export function createEntitlementsDurableRightGrantCapability(
  repository: EntitlementsDurableRightGrantRepository,
): EntitlementsDurableRightGrantCapability {
  return Object.freeze({
    async grant(
      input: EntitlementsGrantDurableRightInput,
    ): Promise<EntitlementsGrantDurableRightResult> {
      if (!validateInput(input)) return { status: "FAILED", code: "INVALID_INPUT" };

      try {
        return await repository.grant({
          ...input,
          subjectId: input.subjectId.trim(),
          resourceId: input.resourceId.trim(),
          sourceReference: input.sourceReference.trim(),
          validFrom: new Date(input.validFrom.getTime()),
          validUntil: input.validUntil ? new Date(input.validUntil.getTime()) : null,
        });
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}

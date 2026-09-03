import type {
  LegalCheckoutPlanType,
  LegalCheckoutRequirementsCapability,
  LegalDocumentType,
  LegalResolveCheckoutRequirementsInput,
  LegalResolveCheckoutRequirementsResult,
} from "../contracts/checkout-requirements.contract";
import type { LegalCheckoutRequirementsRepository } from "./checkout-requirements-repository";

const BASE_CHECKOUT_TYPES = [
  "SOFTWARE_LICENSE_AGREEMENT",
  "REFUND_POLICY",
] as const satisfies readonly LegalDocumentType[];
const SUBSCRIPTION_TYPES = ["SUBSCRIPTION_TERMS"] as const satisfies readonly LegalDocumentType[];

function requiredTypes(planType: LegalCheckoutPlanType): readonly LegalDocumentType[] {
  return planType === "PERPETUAL"
    ? BASE_CHECKOUT_TYPES
    : [...BASE_CHECKOUT_TYPES, ...SUBSCRIPTION_TYPES];
}

function validInput(input: LegalResolveCheckoutRequirementsInput): boolean {
  if (input.planType !== "PERPETUAL" && input.planType !== "MONTHLY" && input.planType !== "ANNUAL") {
    return false;
  }
  if (!input.selectedVersionIds) return true;
  return (
    input.selectedVersionIds.length > 0 &&
    input.selectedVersionIds.every((value) => typeof value === "string" && value.trim().length > 0) &&
    new Set(input.selectedVersionIds).size === input.selectedVersionIds.length
  );
}

export function createLegalCheckoutRequirementsCapability(
  repository: LegalCheckoutRequirementsRepository,
): LegalCheckoutRequirementsCapability {
  const capability: LegalCheckoutRequirementsCapability = {
    async resolve(
      input: LegalResolveCheckoutRequirementsInput,
    ): Promise<LegalResolveCheckoutRequirementsResult> {
      if (!validInput(input)) return { status: "FAILED", code: "INVALID_INPUT" };
      const types = requiredTypes(input.planType);
      try {
        const resolved = await repository.findCurrent(types);
        if (resolved.length !== types.length) {
          return { status: "FAILED", code: "LEGAL_DOCUMENTS_UNAVAILABLE" };
        }
        const byType = new Map(resolved.map((item) => [item.documentType, item] as const));
        const requirements = types.map((type) => byType.get(type)).filter((item) => item !== undefined);
        if (requirements.length !== types.length) {
          return { status: "FAILED", code: "LEGAL_DOCUMENTS_UNAVAILABLE" };
        }
        if (input.selectedVersionIds) {
          const selected = new Set(input.selectedVersionIds);
          if (
            selected.size !== requirements.length ||
            requirements.some((item) => !selected.has(item.documentVersionId))
          ) {
            return { status: "REJECTED", code: "LEGAL_ACCEPTANCE_REQUIRED" };
          }
        }
        return { status: "RESOLVED", requirements: Object.freeze(requirements) };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  };
  return Object.freeze(capability);
}

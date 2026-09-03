import type {
  LegalCheckoutPlanType,
  LegalCheckoutRequirementSnapshot,
  LegalCheckoutRequirementsCapability,
  LegalDocumentType,
  LegalResolveCheckoutRequirementsInput,
  LegalResolveCheckoutRequirementsResult,
} from "../contracts/checkout-requirements.contract";
import type { LegalCheckoutRequirementsRepository } from "./checkout-requirements-repository";
import { legalRenderedContentSha256, normalizeLegalVariables } from "./render";

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
  if (input.selectedVersionIds) {
    if (
      input.selectedVersionIds.length === 0 ||
      !input.selectedVersionIds.every((value) => typeof value === "string" && value.trim().length > 0) ||
      new Set(input.selectedVersionIds).size !== input.selectedVersionIds.length
    ) {
      return false;
    }
  }
  return input.variables === undefined || normalizeLegalVariables(input.variables) !== null;
}

export function createLegalCheckoutRequirementsCapability(
  repository: LegalCheckoutRequirementsRepository,
): LegalCheckoutRequirementsCapability {
  const capability: LegalCheckoutRequirementsCapability = {
    async resolve(
      input: LegalResolveCheckoutRequirementsInput,
    ): Promise<LegalResolveCheckoutRequirementsResult> {
      if (!validInput(input)) return { status: "FAILED", code: "INVALID_INPUT" };
      const variables = normalizeLegalVariables(input.variables ?? {})!;
      const types = requiredTypes(input.planType);
      try {
        const resolved = await repository.findCurrent(types);
        if (resolved.length !== types.length) {
          return { status: "FAILED", code: "LEGAL_DOCUMENTS_UNAVAILABLE" };
        }
        const byType = new Map(resolved.map((item) => [item.documentType, item] as const));
        const sources = types.map((type) => byType.get(type)).filter((item) => item !== undefined);
        if (sources.length !== types.length) {
          return { status: "FAILED", code: "LEGAL_DOCUMENTS_UNAVAILABLE" };
        }
        if (input.selectedVersionIds) {
          const selected = new Set(input.selectedVersionIds);
          if (
            selected.size !== sources.length ||
            sources.some((item) => !selected.has(item.documentVersionId))
          ) {
            return { status: "REJECTED", code: "LEGAL_ACCEPTANCE_REQUIRED" };
          }
        }
        const requirements: LegalCheckoutRequirementSnapshot[] = sources.map((item) => ({
          documentId: item.documentId,
          documentType: item.documentType,
          title: item.title,
          slug: item.slug,
          documentVersionId: item.documentVersionId,
          version: item.version,
          slaVersion: item.slaVersion,
          publishedContentSha256: item.publishedContentSha256,
          renderedContentSha256: legalRenderedContentSha256(item.markdownContent, variables),
          variablesSnapshot: Object.freeze({ ...variables }),
          requiresReacceptance: item.requiresReacceptance,
        }));
        return { status: "RESOLVED", requirements: Object.freeze(requirements) };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  };
  return Object.freeze(capability);
}

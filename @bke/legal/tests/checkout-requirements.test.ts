import { describe, expect, it } from "vitest";
import type { LegalDocumentType } from "../contracts/checkout-requirements.contract";
import { createLegalCheckoutRequirementsCapability } from "../logic/checkout-requirements";
import type {
  LegalCheckoutRequirementSource,
  LegalCheckoutRequirementsRepository,
} from "../logic/checkout-requirements-repository";
import { legalRenderedContentSha256 } from "../logic/render";

function requirement(type: LegalDocumentType, index: number): LegalCheckoutRequirementSource {
  return {
    documentId: `doc-${index}`,
    documentType: type,
    title: type,
    slug: type.toLowerCase(),
    documentVersionId: `version-${index}`,
    version: "1.0",
    slaVersion: "1.0",
    publishedContentSha256: `${index}`.repeat(64).slice(0, 64),
    markdownContent: `# ${type}\nCompany {{company_name}}`,
    requiresReacceptance: false,
  };
}

function repository(): LegalCheckoutRequirementsRepository {
  return {
    async findCurrent(types) {
      return types.map((type, index) => requirement(type, index + 1));
    },
  };
}

describe("Legal checkout requirements", () => {
  it("requires EULA and refund policy for perpetual checkout", async () => {
    const capability = createLegalCheckoutRequirementsCapability(repository());
    const result = await capability.resolve({ planType: "PERPETUAL" });
    expect(result.status).toBe("RESOLVED");
    if (result.status !== "RESOLVED") return;
    expect(result.requirements.map((item) => item.documentType)).toEqual([
      "SOFTWARE_LICENSE_AGREEMENT",
      "REFUND_POLICY",
    ]);
  });

  it("adds subscription terms for recurring checkout", async () => {
    const capability = createLegalCheckoutRequirementsCapability(repository());
    const result = await capability.resolve({ planType: "ANNUAL" });
    expect(result.status).toBe("RESOLVED");
    if (result.status !== "RESOLVED") return;
    expect(result.requirements.map((item) => item.documentType)).toEqual([
      "SOFTWARE_LICENSE_AGREEMENT",
      "REFUND_POLICY",
      "SUBSCRIPTION_TERMS",
    ]);
  });

  it("rejects a stale or incomplete browser version selection", async () => {
    const capability = createLegalCheckoutRequirementsCapability(repository());
    const result = await capability.resolve({
      planType: "MONTHLY",
      selectedVersionIds: ["version-1", "version-2"],
    });
    expect(result).toEqual({ status: "REJECTED", code: "LEGAL_ACCEPTANCE_REQUIRED" });
  });

  it("renders canonical acceptance evidence from supplied variables", async () => {
    const capability = createLegalCheckoutRequirementsCapability(repository());
    const result = await capability.resolve({
      planType: "PERPETUAL",
      selectedVersionIds: ["version-2", "version-1"],
      variables: { company_name: "BKE Digital Solutions" },
    });
    expect(result.status).toBe("RESOLVED");
    if (result.status !== "RESOLVED") return;
    const first = result.requirements[0]!;
    expect(first.variablesSnapshot).toEqual({ company_name: "BKE Digital Solutions" });
    expect(first.renderedContentSha256).toBe(
      legalRenderedContentSha256(
        "# SOFTWARE_LICENSE_AGREEMENT\nCompany {{company_name}}",
        { company_name: "BKE Digital Solutions" },
      ),
    );
  });
});

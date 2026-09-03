import { describe, expect, it } from "vitest";
import type {
  LegalCheckoutRequirementSnapshot,
  LegalDocumentType,
} from "../contracts/checkout-requirements.contract";
import { createLegalCheckoutRequirementsCapability } from "../logic/checkout-requirements";
import type { LegalCheckoutRequirementsRepository } from "../logic/checkout-requirements-repository";

function requirement(type: LegalDocumentType, index: number): LegalCheckoutRequirementSnapshot {
  return {
    documentId: `doc-${index}`,
    documentType: type,
    title: type,
    slug: type.toLowerCase(),
    documentVersionId: `version-${index}`,
    version: "1.0",
    slaVersion: "1.0",
    renderedContentSha256: `${index}`.repeat(64).slice(0, 64),
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

  it("accepts the exact canonical version set regardless of client ordering", async () => {
    const capability = createLegalCheckoutRequirementsCapability(repository());
    const result = await capability.resolve({
      planType: "MONTHLY",
      selectedVersionIds: ["version-3", "version-1", "version-2"],
    });
    expect(result.status).toBe("RESOLVED");
  });
});

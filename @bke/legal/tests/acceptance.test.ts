import { describe, expect, it } from "vitest";
import type {
  LegalCheckAcceptanceInput,
  LegalCheckAcceptanceResult,
  LegalRecordAcceptanceInput,
  LegalRecordAcceptanceResult,
} from "../contracts/acceptance.contract";
import { createLegalAcceptanceCapability } from "../logic/acceptance";
import type { LegalAcceptanceRepository } from "../logic/acceptance-repository";

const sha = "A".repeat(64);

function input(): LegalRecordAcceptanceInput {
  return {
    principalId: " principal-1 ",
    customerAccountId: " account-1 ",
    documentId: " terms ",
    documentVersionId: " terms-v1 ",
    acceptanceContext: " checkout ",
    slaVersion: " sla-v1 ",
    renderedContentSha256: sha,
    variablesSnapshot: { company_name: "BKE" },
    ipAddress: " 127.0.0.1 ",
    userAgent: " BKE-Certifier/1.0 ",
  };
}

function repository(overrides: Partial<LegalAcceptanceRepository> = {}): LegalAcceptanceRepository {
  return {
    async record(value: LegalRecordAcceptanceInput): Promise<LegalRecordAcceptanceResult> {
      return {
        status: "RECORDED",
        value: {
          acceptanceId: "acceptance-1",
          principalId: value.principalId,
          customerAccountId: value.customerAccountId ?? null,
          documentId: value.documentId,
          documentVersionId: value.documentVersionId,
          acceptanceContext: value.acceptanceContext,
          slaVersion: value.slaVersion,
          renderedContentSha256: value.renderedContentSha256,
          variablesSnapshot: value.variablesSnapshot,
          ipAddress: value.ipAddress ?? null,
          userAgent: value.userAgent ?? null,
          acceptedAt: new Date("2026-09-02T00:00:00Z"),
        },
      };
    },
    async check(): Promise<LegalCheckAcceptanceResult> {
      return { status: "NOT_ACCEPTED" };
    },
    ...overrides,
  };
}

describe("Legal acceptance", () => {
  it("normalizes acceptance identity and request evidence before recording", async () => {
    let seen: LegalRecordAcceptanceInput | undefined;
    const capability = createLegalAcceptanceCapability(repository({
      async record(value) {
        seen = value;
        return repository().record(value);
      },
    }));

    const result = await capability.record(input());
    expect(result.status).toBe("RECORDED");
    expect(seen).toMatchObject({
      principalId: "principal-1",
      customerAccountId: "account-1",
      documentId: "terms",
      documentVersionId: "terms-v1",
      acceptanceContext: "checkout",
      slaVersion: "sla-v1",
      renderedContentSha256: "a".repeat(64),
      ipAddress: "127.0.0.1",
      userAgent: "BKE-Certifier/1.0",
    });
  });

  it("rejects malformed hashes and oversized request evidence before persistence", async () => {
    let called = false;
    const capability = createLegalAcceptanceCapability(repository({
      async record(value) {
        called = true;
        return repository().record(value);
      },
    }));
    expect(await capability.record({ ...input(), renderedContentSha256: "not-a-sha" })).toEqual({
      status: "FAILED",
      code: "INVALID_INPUT",
    });
    expect(await capability.record({ ...input(), userAgent: "x".repeat(501) })).toEqual({
      status: "FAILED",
      code: "INVALID_INPUT",
    });
    expect(called).toBe(false);
  });

  it("checks exact acceptance evidence and keeps account optional", async () => {
    let seen: LegalCheckAcceptanceInput | undefined;
    const capability = createLegalAcceptanceCapability(repository({
      async check(value) {
        seen = value;
        return { status: "NOT_ACCEPTED" };
      },
    }));
    const result = await capability.check({
      principalId: " principal-1 ",
      customerAccountId: null,
      documentId: " terms ",
      documentVersionId: " terms-v1 ",
      acceptanceContext: " checkout ",
      slaVersion: " sla-v1 ",
      renderedContentSha256: sha,
    });
    expect(result).toEqual({ status: "NOT_ACCEPTED" });
    expect(seen?.customerAccountId).toBeNull();
    expect(seen?.renderedContentSha256).toBe("a".repeat(64));
  });

  it("fails closed when persistence is unavailable", async () => {
    const capability = createLegalAcceptanceCapability(repository({
      async check() {
        throw new Error("offline");
      },
    }));
    const result = await capability.check({ ...input() });
    expect(result).toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});

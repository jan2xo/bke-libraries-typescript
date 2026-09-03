import { describe, expect, it } from "vitest";
import { createLegalReacceptanceStatusCapability } from "../logic/reacceptance-status";
import type { LegalReacceptanceStatusRepository } from "../logic/reacceptance-status-repository";

function repository(overrides: Partial<LegalReacceptanceStatusRepository> = {}): LegalReacceptanceStatusRepository {
  return {
    async findPending() {
      return [];
    },
    ...overrides,
  };
}

describe("Legal reacceptance status", () => {
  it("normalizes principal identity and returns current when nothing is pending", async () => {
    let seen: string | undefined;
    const capability = createLegalReacceptanceStatusCapability(repository({
      async findPending(input) {
        seen = input.principalId;
        return [];
      },
    }));
    const result = await capability.check({
      principalId: " principal-1 ",
      principalEstablishedAt: new Date("2026-01-01T00:00:00Z"),
    });
    expect(result).toEqual({ status: "CURRENT", pending: [] });
    expect(seen).toBe("principal-1");
  });

  it("surfaces pending canonical versions", async () => {
    const capability = createLegalReacceptanceStatusCapability(repository({
      async findPending() {
        return [{
          documentId: "terms",
          documentType: "TERMS_OF_SERVICE",
          title: "Terms",
          slug: "terms",
          documentVersionId: "terms-v2",
          version: "2.0.0",
          publishedAt: new Date("2026-09-01T00:00:00Z"),
        }];
      },
    }));
    const result = await capability.check({
      principalId: "principal-1",
      principalEstablishedAt: new Date("2026-01-01T00:00:00Z"),
    });
    expect(result.status).toBe("REACCEPTANCE_REQUIRED");
  });

  it("rejects invalid establishment timestamps and fails closed on persistence errors", async () => {
    const capability = createLegalReacceptanceStatusCapability(repository({
      async findPending() {
        throw new Error("offline");
      },
    }));
    expect(await capability.check({ principalId: "principal-1", principalEstablishedAt: new Date("invalid") })).toEqual({
      status: "FAILED",
      code: "INVALID_INPUT",
    });
    expect(await capability.check({ principalId: "principal-1", principalEstablishedAt: new Date("2026-01-01T00:00:00Z") })).toEqual({
      status: "FAILED",
      code: "PERSISTENCE_UNAVAILABLE",
    });
  });
});

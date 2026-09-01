import { describe, expect, it, vi } from "vitest";
import type { IdentityMfaDisableRepository } from "../logic/mfa-disable-repository";
import { createIdentityMfaDisableCapability } from "../logic/mfa-disable";

const now = new Date("2026-08-31T04:00:00.000Z");

function repository(
  result: "DISABLED" | "NOT_FOUND" | "FORBIDDEN" | "MFA_NOT_ENABLED" = "DISABLED",
): IdentityMfaDisableRepository {
  return {
    disableMfa: vi.fn(async () => result),
  };
}

describe("Identity MFA disable", () => {
  it("rejects blank user ids without touching persistence", async () => {
    const repo = repository();
    const capability = createIdentityMfaDisableCapability(repo, () => now);

    await expect(capability.disable({ userId: "   " })).resolves.toEqual({
      status: "INVALID",
      code: "INVALID_INPUT",
    });
    expect(repo.disableMfa).not.toHaveBeenCalled();
  });

  it.each([
    ["NOT_FOUND", "NOT_FOUND"],
    ["FORBIDDEN", "FORBIDDEN"],
    ["MFA_NOT_ENABLED", "MFA_NOT_ENABLED"],
  ] as const)("maps %s persistence authority result", async (repositoryResult, code) => {
    const capability = createIdentityMfaDisableCapability(
      repository(repositoryResult),
      () => now,
    );

    await expect(capability.disable({ userId: "admin-1" })).resolves.toEqual({
      status: "INVALID",
      code,
    });
  });

  it("returns the authoritative disable timestamp after one successful transition", async () => {
    const repo = repository();
    const capability = createIdentityMfaDisableCapability(repo, () => now);

    await expect(capability.disable({ userId: " admin-1 " })).resolves.toEqual({
      status: "DISABLED",
      userId: "admin-1",
      disabledAt: now,
      enrollmentRequired: true,
    });
    expect(repo.disableMfa).toHaveBeenCalledWith("admin-1", now);
  });

  it("fails closed when persistence is unavailable", async () => {
    const repo: IdentityMfaDisableRepository = {
      disableMfa: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    };
    const capability = createIdentityMfaDisableCapability(repo, () => now);

    await expect(capability.disable({ userId: "admin-1" })).resolves.toEqual({
      status: "FAILED",
      code: "PERSISTENCE_UNAVAILABLE",
    });
  });
});

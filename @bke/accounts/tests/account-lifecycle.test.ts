import { describe, expect, it, vi } from "vitest";
import { createAccountsAccountLifecycleCapability } from "../logic/account-lifecycle";
import type { AccountsAccountLifecycleRepository } from "../logic/account-lifecycle-repository";

function repository(): AccountsAccountLifecycleRepository {
  return {
    findLifecycle: vi.fn(async (accountId: string) => ({
      accountId,
      lifecycleState: "ACTIVE" as const,
    })),
  };
}

describe("Accounts account lifecycle facts", () => {
  it("returns the Accounts-owned lifecycle fact without a principal", async () => {
    const repo = repository();
    const capability = createAccountsAccountLifecycleCapability(repo);

    await expect(capability.findByAccountId(" account-1 ")).resolves.toEqual({
      status: "FOUND",
      value: { accountId: "account-1", lifecycleState: "ACTIVE" },
    });
    expect(repo.findLifecycle).toHaveBeenCalledWith("account-1");
  });

  it("returns NOT_FOUND when Accounts has no matching account", async () => {
    const repo: AccountsAccountLifecycleRepository = {
      findLifecycle: vi.fn(async () => null),
    };
    const capability = createAccountsAccountLifecycleCapability(repo);

    await expect(capability.findByAccountId("missing-account")).resolves.toEqual({
      status: "NOT_FOUND",
    });
  });

  it("rejects invalid account ids before persistence", async () => {
    const repo = repository();
    const capability = createAccountsAccountLifecycleCapability(repo);

    await expect(capability.findByAccountId("   ")).resolves.toEqual({
      status: "FAILED",
      code: "INVALID_INPUT",
    });
    await expect(capability.findByAccountId("x".repeat(257))).resolves.toEqual({
      status: "FAILED",
      code: "INVALID_INPUT",
    });
    expect(repo.findLifecycle).not.toHaveBeenCalled();
  });

  it("maps repository failures to PERSISTENCE_UNAVAILABLE", async () => {
    const repo: AccountsAccountLifecycleRepository = {
      findLifecycle: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    };
    const capability = createAccountsAccountLifecycleCapability(repo);

    await expect(capability.findByAccountId("account-1")).resolves.toEqual({
      status: "FAILED",
      code: "PERSISTENCE_UNAVAILABLE",
    });
  });
});

import { describe, expect, it, vi } from "vitest";
import { createAccountsSwitchableAccountListCapability } from "../logic/switchable-account-list";
import type {
  AccountsSwitchableAccountListRepository,
  AccountsSwitchableAccountRecord,
} from "../logic/switchable-account-list-repository";

describe("Accounts switchable account list", () => {
  it("maps owner precedence and membership roles while preserving repository order", async () => {
    const repository: AccountsSwitchableAccountListRepository = {
      listSwitchable: vi.fn(
        async (): Promise<readonly AccountsSwitchableAccountRecord[]> => [
          {
            account: {
              id: "individual-1",
              type: "INDIVIDUAL",
              displayName: "Alice",
              ownerId: "principal-1",
              lifecycleState: "ACTIVE",
            },
            membershipRole: null,
          },
          {
            account: {
              id: "organization-1",
              type: "ORGANIZATION",
              displayName: "Example Org",
              ownerId: "someone-else",
              lifecycleState: "ACTIVE",
            },
            membershipRole: "BILLING",
          },
        ],
      ),
    };
    const capability = createAccountsSwitchableAccountListCapability(repository);
    await expect(capability.list({ principalId: " principal-1 " })).resolves.toEqual({
      status: "LISTED",
      accounts: [
        {
          id: "individual-1",
          type: "INDIVIDUAL",
          displayName: "Alice",
          lifecycleState: "ACTIVE",
          effectiveRole: "OWNER",
        },
        {
          id: "organization-1",
          type: "ORGANIZATION",
          displayName: "Example Org",
          lifecycleState: "ACTIVE",
          effectiveRole: "BILLING",
        },
      ],
    });
    expect(repository.listSwitchable).toHaveBeenCalledWith("principal-1");
  });

  it("returns an empty LISTED result when no active account is switchable", async () => {
    const capability = createAccountsSwitchableAccountListCapability({
      listSwitchable: vi.fn(async () => []),
    });
    await expect(capability.list({ principalId: "principal-1" })).resolves.toEqual({
      status: "LISTED",
      accounts: [],
    });
  });

  it("rejects invalid principal input before persistence", async () => {
    const repository: AccountsSwitchableAccountListRepository = {
      listSwitchable: vi.fn(async () => []),
    };
    const capability = createAccountsSwitchableAccountListCapability(repository);
    await expect(capability.list({ principalId: "" })).resolves.toEqual({
      status: "FAILED",
      code: "INVALID_INPUT",
    });
    expect(repository.listSwitchable).not.toHaveBeenCalled();
  });

  it("maps repository failure to PERSISTENCE_UNAVAILABLE", async () => {
    const capability = createAccountsSwitchableAccountListCapability({
      listSwitchable: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    });
    await expect(capability.list({ principalId: "principal-1" })).resolves.toEqual({
      status: "FAILED",
      code: "PERSISTENCE_UNAVAILABLE",
    });
  });
});

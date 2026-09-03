import { describe, expect, it, vi } from "vitest";
import type { AccountsLifecycleState, AccountsMemberRole } from "../contracts/account.contract";
import { createAccountsAccountAccessCapability } from "../logic/account-access";
import type { AccountsAccountAccessRepository } from "../logic/account-access-repository";
import { roleHasAccountsCapability } from "../logic/account-authorization-policy";

function account(lifecycleState: AccountsLifecycleState = "ACTIVE") {
  return {
    id: "account-1",
    type: "ORGANIZATION" as const,
    displayName: "Example Org",
    ownerId: "owner-1",
    billingEmail: "billing@example.com",
    taxId: null,
    lifecycleState,
  };
}

function repository(
  role: AccountsMemberRole | null,
  lifecycleState: AccountsLifecycleState = "ACTIVE",
): AccountsAccountAccessRepository {
  return {
    findAccess: vi.fn(async () => ({ account: account(lifecycleState), membershipRole: role })),
  };
}

describe("Accounts account access", () => {
  it("preserves the V1 role capability matrix", () => {
    expect(roleHasAccountsCapability("OWNER", "MANAGE_MEMBERS")).toBe(true);
    expect(roleHasAccountsCapability("OWNER", "ASSIGN_LICENSE")).toBe(true);
    expect(roleHasAccountsCapability("BILLING", "VIEW_PAYMENTS")).toBe(true);
    expect(roleHasAccountsCapability("BILLING", "VIEW_LICENSES")).toBe(false);
    expect(roleHasAccountsCapability("LICENSE_MANAGER", "VIEW_LICENSES")).toBe(true);
    expect(roleHasAccountsCapability("LICENSE_MANAGER", "PURCHASE")).toBe(false);
    expect(roleHasAccountsCapability("MEMBER", "VIEW_ORDERS")).toBe(false);
  });

  it("treats the account owner as OWNER even without a Membership row", async () => {
    const capability = createAccountsAccountAccessCapability(repository(null));
    const result = await capability.authorize({
      principalId: "owner-1",
      accountId: "account-1",
      requiredCapability: "CLOSE_ACCOUNT",
    });
    expect(result.status).toBe("AUTHORIZED");
    if (result.status === "AUTHORIZED") expect(result.effectiveRole).toBe("OWNER");
  });

  it("authorizes a membership role when the capability is granted", async () => {
    const capability = createAccountsAccountAccessCapability(repository("BILLING"));
    const result = await capability.authorize({
      principalId: "billing-1",
      accountId: "account-1",
      requiredCapability: "VIEW_PAYMENTS",
    });
    expect(result.status).toBe("AUTHORIZED");
    if (result.status === "AUTHORIZED") expect(result.effectiveRole).toBe("BILLING");
  });

  it("rejects a known account member whose role lacks the requested capability", async () => {
    const capability = createAccountsAccountAccessCapability(repository("BILLING"));
    await expect(
      capability.authorize({
        principalId: "billing-1",
        accountId: "account-1",
        requiredCapability: "MANAGE_MEMBERS",
      }),
    ).resolves.toEqual({ status: "REJECTED", code: "ACCOUNT_ROLE_FORBIDDEN" });
  });

  it("rejects PURCHASE on a non-active account after role authorization", async () => {
    const capability = createAccountsAccountAccessCapability(repository("BILLING", "CLOSED"));
    await expect(
      capability.authorize({
        principalId: "billing-1",
        accountId: "account-1",
        requiredCapability: "PURCHASE",
      }),
    ).resolves.toEqual({ status: "REJECTED", code: "ACCOUNT_NOT_ACTIVE" });
  });

  it("does not leak account lifecycle when the role lacks PURCHASE", async () => {
    const capability = createAccountsAccountAccessCapability(repository("MEMBER", "CLOSED"));
    await expect(
      capability.authorize({
        principalId: "member-1",
        accountId: "account-1",
        requiredCapability: "PURCHASE",
      }),
    ).resolves.toEqual({ status: "REJECTED", code: "ACCOUNT_ROLE_FORBIDDEN" });
  });

  it("allows non-purchase access to a non-active account when the role permits it", async () => {
    const capability = createAccountsAccountAccessCapability(repository("BILLING", "CLOSED"));
    const result = await capability.authorize({
      principalId: "billing-1",
      accountId: "account-1",
      requiredCapability: "VIEW_ORDERS",
    });
    expect(result.status).toBe("AUTHORIZED");
  });

  it("allows access without a required capability even for MEMBER", async () => {
    const capability = createAccountsAccountAccessCapability(repository("MEMBER"));
    const result = await capability.authorize({ principalId: "member-1", accountId: "account-1" });
    expect(result.status).toBe("AUTHORIZED");
    if (result.status === "AUTHORIZED") expect(result.effectiveRole).toBe("MEMBER");
  });

  it("returns NOT_FOUND when the principal has no account access", async () => {
    const repo: AccountsAccountAccessRepository = { findAccess: vi.fn(async () => null) };
    const capability = createAccountsAccountAccessCapability(repo);
    await expect(
      capability.authorize({ principalId: "outsider", accountId: "account-1" }),
    ).resolves.toEqual({ status: "REJECTED", code: "NOT_FOUND" });
  });

  it("rejects invalid input before persistence", async () => {
    const repo = repository("MEMBER");
    const capability = createAccountsAccountAccessCapability(repo);
    await expect(
      capability.authorize({ principalId: "", accountId: "account-1" }),
    ).resolves.toEqual({ status: "FAILED", code: "INVALID_INPUT" });
    expect(repo.findAccess).not.toHaveBeenCalled();
  });

  it("maps repository errors to PERSISTENCE_UNAVAILABLE", async () => {
    const repo: AccountsAccountAccessRepository = {
      findAccess: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    };
    const capability = createAccountsAccountAccessCapability(repo);
    await expect(
      capability.authorize({ principalId: "owner-1", accountId: "account-1" }),
    ).resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});

import { describe, expect, it, vi } from "vitest";
import type { AccountsLifecycleState, AccountsMemberRole } from "../contracts/account.contract";
import { createAccountsAccountAccessCapability } from "../logic/account-access";
import type { AccountsAccountAccessRepository } from "../logic/account-access-repository";
import { createAccountsPurchaseAccessCapability } from "../logic/purchase-access";

function repository(
  principalId: string,
  role: AccountsMemberRole | null,
  lifecycleState: AccountsLifecycleState = "ACTIVE",
): AccountsAccountAccessRepository {
  return {
    findAccess: vi.fn(async () => ({
      account: {
        id: "account-1",
        type: "ORGANIZATION" as const,
        displayName: "Example Org",
        ownerId: principalId === "owner-1" ? "owner-1" : "different-owner",
        billingEmail: "billing@example.com",
        taxId: null,
        lifecycleState,
      },
      membershipRole: role,
    })),
  };
}

function capability(
  principalId: string,
  role: AccountsMemberRole | null,
  lifecycleState: AccountsLifecycleState = "ACTIVE",
) {
  return createAccountsPurchaseAccessCapability(
    createAccountsAccountAccessCapability(repository(principalId, role, lifecycleState)),
  );
}

describe("Accounts purchase access", () => {
  it("authorizes an active owner", async () => {
    await expect(
      capability("owner-1", null).authorize({ principalId: "owner-1", accountId: "account-1" }),
    ).resolves.toMatchObject({ status: "AUTHORIZED", effectiveRole: "OWNER" });
  });

  it("authorizes an active billing member", async () => {
    await expect(
      capability("billing-1", "BILLING").authorize({
        principalId: "billing-1",
        accountId: "account-1",
      }),
    ).resolves.toMatchObject({ status: "AUTHORIZED", effectiveRole: "BILLING" });
  });

  it("rejects a non-active account after purchase role authorization", async () => {
    await expect(
      capability("billing-1", "BILLING", "SUSPENDED").authorize({
        principalId: "billing-1",
        accountId: "account-1",
      }),
    ).resolves.toEqual({ status: "REJECTED", code: "ACCOUNT_NOT_ACTIVE" });
  });

  it("preserves role rejection before lifecycle disclosure", async () => {
    await expect(
      capability("member-1", "MEMBER", "SUSPENDED").authorize({
        principalId: "member-1",
        accountId: "account-1",
      }),
    ).resolves.toEqual({ status: "REJECTED", code: "ACCOUNT_ROLE_FORBIDDEN" });
  });

  it("propagates generic access failures", async () => {
    const access = createAccountsAccountAccessCapability({
      findAccess: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    });
    const purchase = createAccountsPurchaseAccessCapability(access);
    await expect(
      purchase.authorize({ principalId: "owner-1", accountId: "account-1" }),
    ).resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});

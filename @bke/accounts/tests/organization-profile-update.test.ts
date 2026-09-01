import { describe, expect, it, vi } from "vitest";
import type {
  AccountsAccountAccessCapability,
  AccountsAccountAccessResult,
} from "../contracts/account-access.contract";
import { createAccountsOrganizationProfileUpdateCapability } from "../logic/organization-profile-update";
import type { AccountsOrganizationProfileUpdateRepository } from "../logic/organization-profile-update-repository";

const baseAccount = {
  id: "org-1",
  type: "ORGANIZATION" as const,
  displayName: "Example Org",
  ownerId: "owner-1",
  billingEmail: "billing@example.com",
  taxId: null,
  lifecycleState: "ACTIVE" as const,
};

function access(role: "OWNER" | "BILLING" | "LICENSE_MANAGER" | "MEMBER" = "OWNER") {
  return {
    authorize: vi.fn(async () => ({
      status: "AUTHORIZED" as const,
      account: baseAccount,
      effectiveRole: role,
    })),
  } satisfies AccountsAccountAccessCapability;
}

function repository(): AccountsOrganizationProfileUpdateRepository {
  return {
    updateOrganizationProfile: vi.fn(async (record) => ({
      account: {
        ...baseAccount,
        displayName: record.displayName ?? baseAccount.displayName,
        billingEmail: record.billingEmail ?? baseAccount.billingEmail,
        taxId: record.taxId === undefined ? baseAccount.taxId : record.taxId,
      },
      organization: {
        accountId: "org-1",
        legalName: record.legalName ?? "Example Organization",
        registrationNumber:
          record.registrationNumber === undefined ? "REG-1" : record.registrationNumber,
      },
    })),
  };
}

describe("Accounts organization profile update", () => {
  it("requires both organization and billing capabilities when both field groups change", async () => {
    const accountAccess = access();
    const repo = repository();
    const capability = createAccountsOrganizationProfileUpdateCapability(accountAccess, repo);
    const result = await capability.update({
      actorPrincipalId: " owner-1 ",
      accountId: " org-1 ",
      displayName: "  New Org  ",
      billingEmail: " NEW@EXAMPLE.COM ",
    });
    expect(result.status).toBe("UPDATED");
    expect(accountAccess.authorize).toHaveBeenNthCalledWith(1, {
      principalId: "owner-1",
      accountId: "org-1",
      requiredCapability: "MANAGE_MEMBERS",
    });
    expect(accountAccess.authorize).toHaveBeenNthCalledWith(2, {
      principalId: "owner-1",
      accountId: "org-1",
      requiredCapability: "VIEW_PAYMENTS",
    });
    expect(repo.updateOrganizationProfile).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: "New Org", billingEmail: "new@example.com" }),
    );
  });

  it("uses VIEW_PAYMENTS only for billing-only changes", async () => {
    const accountAccess = access("BILLING");
    const capability = createAccountsOrganizationProfileUpdateCapability(accountAccess, repository());
    await capability.update({
      actorPrincipalId: "billing-1",
      accountId: "org-1",
      taxId: null,
    });
    expect(accountAccess.authorize).toHaveBeenCalledTimes(1);
    expect(accountAccess.authorize).toHaveBeenCalledWith({
      principalId: "billing-1",
      accountId: "org-1",
      requiredCapability: "VIEW_PAYMENTS",
    });
  });

  it("requires MANAGE_MEMBERS for a no-op request like V1 mutable-organization logic", async () => {
    const accountAccess = access();
    const capability = createAccountsOrganizationProfileUpdateCapability(accountAccess, repository());
    await capability.update({ actorPrincipalId: "owner-1", accountId: "org-1" });
    expect(accountAccess.authorize).toHaveBeenCalledWith({
      principalId: "owner-1",
      accountId: "org-1",
      requiredCapability: "MANAGE_MEMBERS",
    });
  });

  it("rejects wrong account type and V1-blocked lifecycle states", async () => {
    const wrongType: AccountsAccountAccessCapability = {
      authorize: vi.fn(async (): Promise<AccountsAccountAccessResult> => ({
        status: "AUTHORIZED",
        account: { ...baseAccount, type: "INDIVIDUAL" },
        effectiveRole: "OWNER",
      })),
    };
    await expect(
      createAccountsOrganizationProfileUpdateCapability(wrongType, repository()).update({
        actorPrincipalId: "owner-1",
        accountId: "org-1",
      }),
    ).resolves.toEqual({ status: "REJECTED", code: "ACCOUNT_NOT_ORGANIZATION" });

    for (const lifecycleState of ["CLOSED", "CLOSURE_REQUESTED", "SUSPENDED"] as const) {
      const lifecycleAccess: AccountsAccountAccessCapability = {
        authorize: vi.fn(async (): Promise<AccountsAccountAccessResult> => ({
          status: "AUTHORIZED",
          account: { ...baseAccount, lifecycleState },
          effectiveRole: "OWNER",
        })),
      };
      const result = await createAccountsOrganizationProfileUpdateCapability(
        lifecycleAccess,
        repository(),
      ).update({ actorPrincipalId: "owner-1", accountId: "org-1" });
      expect(result).toEqual({
        status: "REJECTED",
        code: lifecycleState === "SUSPENDED" ? "SUSPENDED_ACCOUNT" : "CLOSED_ACCOUNT",
      });
    }
  });

  it("maps access and persistence failures without leaking infrastructure errors", async () => {
    const rejected: AccountsAccountAccessCapability = {
      authorize: vi.fn(async (): Promise<AccountsAccountAccessResult> => ({
        status: "REJECTED",
        code: "ACCOUNT_ROLE_FORBIDDEN",
      })),
    };
    await expect(
      createAccountsOrganizationProfileUpdateCapability(rejected, repository()).update({
        actorPrincipalId: "member-1",
        accountId: "org-1",
      }),
    ).resolves.toEqual({ status: "REJECTED", code: "ACCOUNT_ROLE_FORBIDDEN" });

    const failingRepo: AccountsOrganizationProfileUpdateRepository = {
      updateOrganizationProfile: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    };
    await expect(
      createAccountsOrganizationProfileUpdateCapability(access(), failingRepo).update({
        actorPrincipalId: "owner-1",
        accountId: "org-1",
      }),
    ).resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});

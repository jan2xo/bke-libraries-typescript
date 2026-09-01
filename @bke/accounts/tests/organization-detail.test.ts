import { describe, expect, it, vi } from "vitest";
import type {
  AccountsAccountAccessCapability,
  AccountsAccountAccessResult,
} from "../contracts/account-access.contract";
import type { AccountsAccountSnapshot, AccountsMemberRole } from "../contracts/account.contract";
import { createAccountsOrganizationDetailCapability } from "../logic/organization-detail";
import type { AccountsOrganizationDetailRepository } from "../logic/organization-detail-repository";

const account = (type: AccountsAccountSnapshot["type"] = "ORGANIZATION"): AccountsAccountSnapshot => ({
  id: "org-detail",
  type,
  displayName: "Detail Org",
  ownerId: "owner-detail",
  billingEmail: "billing@detail.test",
  taxId: "TAX-DETAIL",
  lifecycleState: "ACTIVE",
});

const authorized = (role: AccountsMemberRole, value = account()): AccountsAccountAccessResult => ({
  status: "AUTHORIZED",
  account: value,
  effectiveRole: role,
});

function fixture(accessResult: AccountsAccountAccessResult = authorized("OWNER")) {
  const accountAccess: AccountsAccountAccessCapability = {
    authorize: vi.fn(async () => accessResult),
  };
  const repository: AccountsOrganizationDetailRepository = {
    get: vi.fn(async () => ({
      status: "FOUND" as const,
      organization: { legalName: "Detail Org Legal", registrationNumber: "REG-1" },
      memberships: [
        { principalId: "owner-detail", role: "OWNER" as const },
        { principalId: "member-detail", role: "MEMBER" as const },
      ],
      pendingInvitations: [
        {
          id: "invite-detail",
          email: "invite@detail.test",
          role: "MEMBER" as const,
          status: "PENDING" as const,
          expiresAt: new Date("2026-09-08T00:00:00.000Z"),
          createdAt: new Date("2026-09-01T00:00:00.000Z"),
        },
      ],
    })),
  };
  return {
    accountAccess,
    repository,
    capability: createAccountsOrganizationDetailCapability(accountAccess, repository),
  };
}

describe("Accounts organization detail", () => {
  it("returns Accounts-owned detail and disclosure flags for OWNER", async () => {
    const f = fixture();
    const result = await f.capability.get({ principalId: " owner-detail ", accountId: " org-detail " });
    expect(result.status).toBe("FOUND");
    if (result.status !== "FOUND") return;
    expect(result.detail.permissions).toEqual({
      canManageMembers: true,
      canViewBilling: true,
      canViewLicenses: true,
    });
    expect(result.detail.billingEmail).toBe("billing@detail.test");
    expect(result.detail.taxId).toBe("TAX-DETAIL");
    expect(result.detail.memberships).toHaveLength(2);
    expect(result.detail.pendingInvitations).toHaveLength(1);
    expect(f.repository.get).toHaveBeenCalledWith({
      accountId: "org-detail",
      includeMembers: true,
      includePendingInvitations: true,
    });
  });

  it("does not request or expose member/invitation data to BILLING", async () => {
    const f = fixture(authorized("BILLING"));
    const result = await f.capability.get({ principalId: "billing-user", accountId: "org-detail" });
    expect(result.status).toBe("FOUND");
    if (result.status !== "FOUND") return;
    expect(result.detail.permissions).toEqual({
      canManageMembers: false,
      canViewBilling: true,
      canViewLicenses: false,
    });
    expect(result.detail.billingEmail).toBe("billing@detail.test");
    expect(result.detail.taxId).toBe("TAX-DETAIL");
    expect(result.detail.memberships).toEqual([]);
    expect(result.detail.pendingInvitations).toEqual([]);
    expect(f.repository.get).toHaveBeenCalledWith({
      accountId: "org-detail",
      includeMembers: false,
      includePendingInvitations: false,
    });
  });

  it("returns licensing permission without exposing billing for LICENSE_MANAGER", async () => {
    const f = fixture(authorized("LICENSE_MANAGER"));
    const result = await f.capability.get({ principalId: "license-user", accountId: "org-detail" });
    expect(result.status).toBe("FOUND");
    if (result.status !== "FOUND") return;
    expect(result.detail.permissions).toEqual({
      canManageMembers: false,
      canViewBilling: false,
      canViewLicenses: true,
    });
    expect(result.detail.billingEmail).toBeNull();
    expect(result.detail.taxId).toBeNull();
    expect(result.detail.memberships).toEqual([]);
    expect(result.detail.pendingInvitations).toEqual([]);
  });

  it("returns only basic Accounts detail for MEMBER", async () => {
    const f = fixture(authorized("MEMBER"));
    const result = await f.capability.get({ principalId: "member-user", accountId: "org-detail" });
    expect(result.status).toBe("FOUND");
    if (result.status !== "FOUND") return;
    expect(result.detail.permissions).toEqual({
      canManageMembers: false,
      canViewBilling: false,
      canViewLicenses: false,
    });
    expect(result.detail.billingEmail).toBeNull();
    expect(result.detail.memberships).toEqual([]);
  });

  it("rejects non-organization accounts before detail persistence", async () => {
    const f = fixture(authorized("OWNER", account("INDIVIDUAL")));
    expect(await f.capability.get({ principalId: "owner-detail", accountId: "org-detail" })).toEqual({
      status: "REJECTED",
      code: "ACCOUNT_NOT_ORGANIZATION",
    });
    expect(f.repository.get).not.toHaveBeenCalled();
  });

  it("propagates access/repository failures and validates input", async () => {
    const invalid = fixture();
    expect(await invalid.capability.get({ principalId: " ", accountId: "org-detail" })).toEqual({
      status: "FAILED",
      code: "INVALID_INPUT",
    });

    const forbidden = fixture({ status: "REJECTED", code: "NOT_FOUND" });
    expect(await forbidden.capability.get({ principalId: "nobody", accountId: "org-detail" })).toEqual({
      status: "REJECTED",
      code: "NOT_FOUND",
    });

    const rejected = fixture();
    rejected.repository.get = vi.fn(async () => ({
      status: "REJECTED" as const,
      code: "NOT_FOUND" as const,
    }));
    expect(
      await createAccountsOrganizationDetailCapability(
        rejected.accountAccess,
        rejected.repository,
      ).get({ principalId: "owner-detail", accountId: "org-detail" }),
    ).toEqual({ status: "REJECTED", code: "NOT_FOUND" });

    const failed = fixture();
    failed.repository.get = vi.fn(async () => {
      throw new Error("database unavailable");
    });
    expect(
      await createAccountsOrganizationDetailCapability(failed.accountAccess, failed.repository).get({
        principalId: "owner-detail",
        accountId: "org-detail",
      }),
    ).toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});

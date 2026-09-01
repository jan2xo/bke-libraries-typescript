import { describe, expect, it, vi } from "vitest";
import type { AccountsAccountAccessResult } from "../contracts/account-access.contract";
import { createAccountsMembershipRoleChangeCapability } from "../logic/membership-role-change";
import type { AccountsMembershipRoleChangeRepository } from "../logic/membership-role-change-repository";

const createdAt = new Date("2026-01-01T00:00:00.000Z");

function authorized(
  overrides: Partial<Extract<AccountsAccountAccessResult, { status: "AUTHORIZED" }>["account"]> = {},
): AccountsAccountAccessResult {
  return {
    status: "AUTHORIZED",
    effectiveRole: "OWNER",
    account: {
      id: "org-1",
      type: "ORGANIZATION",
      displayName: "Org",
      ownerId: "actor-1",
      billingEmail: "billing@example.com",
      taxId: null,
      lifecycleState: "ACTIVE",
      ...overrides,
    },
  };
}

describe("Accounts membership role change", () => {
  it("reuses MANAGE_MEMBERS authorization and returns audit intent", async () => {
    const authorize = vi.fn(async () => authorized());
    const updateRole = vi.fn(async () => ({
      status: "UPDATED" as const,
      previousRole: "BILLING" as const,
      membership: {
        accountId: "org-1",
        userId: "member-1",
        role: "LICENSE_MANAGER" as const,
        createdAt,
      },
    }));
    const capability = createAccountsMembershipRoleChangeCapability({ authorize }, { updateRole });

    await expect(
      capability.update({
        actorPrincipalId: " actor-1 ",
        accountId: " org-1 ",
        targetPrincipalId: " member-1 ",
        role: "LICENSE_MANAGER",
      }),
    ).resolves.toEqual({
      status: "UPDATED",
      membership: {
        accountId: "org-1",
        userId: "member-1",
        role: "LICENSE_MANAGER",
        createdAt,
      },
      auditIntent: {
        action: "ORGANIZATION_MEMBER_ROLE_UPDATED",
        accountId: "org-1",
        targetType: "Membership",
        targetId: "member-1",
        from: "BILLING",
        to: "LICENSE_MANAGER",
      },
    });
    expect(authorize).toHaveBeenCalledWith({
      principalId: "actor-1",
      accountId: "org-1",
      requiredCapability: "MANAGE_MEMBERS",
    });
  });

  it("preserves account authorization and lifecycle rejection", async () => {
    const updateRole = vi.fn();
    for (const access of [
      { status: "REJECTED", code: "ACCOUNT_ROLE_FORBIDDEN" } as AccountsAccountAccessResult,
      authorized({ type: "INDIVIDUAL" }),
      authorized({ lifecycleState: "SUSPENDED" }),
      authorized({ lifecycleState: "CLOSED" }),
    ]) {
      const capability = createAccountsMembershipRoleChangeCapability(
        { authorize: vi.fn(async () => access) },
        { updateRole },
      );
      const result = await capability.update({
        actorPrincipalId: "actor-1",
        accountId: "org-1",
        targetPrincipalId: "member-1",
        role: "MEMBER",
      });
      expect(result.status).toBe("REJECTED");
    }
    expect(updateRole).not.toHaveBeenCalled();
  });

  it("preserves member and last-owner repository rejections", async () => {
    for (const code of ["MEMBER_NOT_FOUND", "LAST_OWNER_REQUIRED"] as const) {
      const repository: AccountsMembershipRoleChangeRepository = {
        updateRole: vi.fn(async () => ({ status: "REJECTED" as const, code })),
      };
      await expect(
        createAccountsMembershipRoleChangeCapability(
          { authorize: vi.fn(async () => authorized()) },
          repository,
        ).update({
          actorPrincipalId: "actor-1",
          accountId: "org-1",
          targetPrincipalId: "member-1",
          role: "MEMBER",
        }),
      ).resolves.toEqual({ status: "REJECTED", code });
    }
  });

  it("rejects invalid input and maps persistence exceptions", async () => {
    const authorize = vi.fn(async () => authorized());
    const updateRole = vi.fn(async () => {
      throw new Error("db unavailable");
    });
    const capability = createAccountsMembershipRoleChangeCapability({ authorize }, { updateRole });

    await expect(
      capability.update({
        actorPrincipalId: "",
        accountId: "org-1",
        targetPrincipalId: "member-1",
        role: "MEMBER",
      }),
    ).resolves.toEqual({ status: "FAILED", code: "INVALID_INPUT" });
    expect(authorize).not.toHaveBeenCalled();

    await expect(
      capability.update({
        actorPrincipalId: "actor-1",
        accountId: "org-1",
        targetPrincipalId: "member-1",
        role: "MEMBER",
      }),
    ).resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});

import { describe, expect, it, vi } from "vitest";
import type { AccountsAccountAccessResult } from "../contracts/account-access.contract";
import { createAccountsMembershipRemovalCapability } from "../logic/membership-removal";
import type { AccountsMembershipRemovalRepository } from "../logic/membership-removal-repository";

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

describe("Accounts membership removal", () => {
  it("reuses MANAGE_MEMBERS authorization and returns host-owned audit intent", async () => {
    const authorize = vi.fn(async () => authorized());
    const remove = vi.fn(async () => ({
      status: "REMOVED" as const,
      membership: {
        accountId: "org-1",
        userId: "member-1",
        role: "MEMBER" as const,
        createdAt,
      },
    }));
    const capability = createAccountsMembershipRemovalCapability({ authorize }, { remove });

    await expect(
      capability.remove({
        actorPrincipalId: " actor-1 ",
        accountId: " org-1 ",
        targetPrincipalId: " member-1 ",
      }),
    ).resolves.toEqual({
      status: "REMOVED",
      membership: {
        accountId: "org-1",
        userId: "member-1",
        role: "MEMBER",
        createdAt,
      },
      auditIntent: {
        action: "ORGANIZATION_MEMBER_REMOVED",
        accountId: "org-1",
        targetType: "Membership",
        targetId: "member-1",
      },
    });
    expect(authorize).toHaveBeenCalledWith({
      principalId: "actor-1",
      accountId: "org-1",
      requiredCapability: "MANAGE_MEMBERS",
    });
  });

  it("preserves authorization/lifecycle rejection before persistence", async () => {
    const remove = vi.fn();
    for (const access of [
      { status: "REJECTED", code: "ACCOUNT_ROLE_FORBIDDEN" } as AccountsAccountAccessResult,
      authorized({ type: "INDIVIDUAL" }),
      authorized({ lifecycleState: "SUSPENDED" }),
      authorized({ lifecycleState: "CLOSED" }),
    ]) {
      const result = await createAccountsMembershipRemovalCapability(
        { authorize: vi.fn(async () => access) },
        { remove },
      ).remove({
        actorPrincipalId: "actor-1",
        accountId: "org-1",
        targetPrincipalId: "member-1",
      });
      expect(result.status).toBe("REJECTED");
    }
    expect(remove).not.toHaveBeenCalled();
  });

  it("preserves missing-member and final-owner rejections", async () => {
    for (const code of ["MEMBER_NOT_FOUND", "LAST_OWNER_REQUIRED"] as const) {
      const repository: AccountsMembershipRemovalRepository = {
        remove: vi.fn(async () => ({ status: "REJECTED" as const, code })),
      };
      await expect(
        createAccountsMembershipRemovalCapability(
          { authorize: vi.fn(async () => authorized()) },
          repository,
        ).remove({
          actorPrincipalId: "actor-1",
          accountId: "org-1",
          targetPrincipalId: "member-1",
        }),
      ).resolves.toEqual({ status: "REJECTED", code });
    }
  });

  it("rejects invalid input and maps persistence failure", async () => {
    const authorize = vi.fn(async () => authorized());
    const repository: AccountsMembershipRemovalRepository = {
      remove: vi.fn(async () => {
        throw new Error("db unavailable");
      }),
    };
    const capability = createAccountsMembershipRemovalCapability({ authorize }, repository);

    await expect(
      capability.remove({ actorPrincipalId: "", accountId: "org-1", targetPrincipalId: "member-1" }),
    ).resolves.toEqual({ status: "FAILED", code: "INVALID_INPUT" });
    expect(authorize).not.toHaveBeenCalled();

    await expect(
      capability.remove({
        actorPrincipalId: "actor-1",
        accountId: "org-1",
        targetPrincipalId: "member-1",
      }),
    ).resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});

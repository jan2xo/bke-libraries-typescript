import { describe, expect, it, vi } from "vitest";
import type {
  AccountsAccountAccessCapability,
  AccountsAccountAccessResult,
} from "../contracts/account-access.contract";
import type { AccountsAccountSnapshot } from "../contracts/account.contract";
import type { AccountsInvitationExpirationCapability } from "../contracts/invitation-expiration.contract";
import type { AccountsInvitationListRepository } from "../logic/invitation-list-repository";
import { createAccountsInvitationListCapability } from "../logic/invitation-list";

const account = (
  overrides: Partial<AccountsAccountSnapshot> = {},
): AccountsAccountSnapshot => ({
  id: "org-1",
  type: "ORGANIZATION",
  displayName: "Org One",
  ownerId: "owner-1",
  billingEmail: "billing@example.com",
  taxId: null,
  lifecycleState: "ACTIVE",
  ...overrides,
});

const authorized = (
  snapshot: AccountsAccountSnapshot = account(),
): AccountsAccountAccessResult => ({
  status: "AUTHORIZED",
  account: snapshot,
  effectiveRole: "OWNER",
});

function fixture(accessResult: AccountsAccountAccessResult = authorized()) {
  const order: string[] = [];
  const expiration: AccountsInvitationExpirationCapability = {
    expire: vi.fn(async () => {
      order.push("expire");
      return {
        status: "EXPIRED" as const,
        count: 1,
        invitations: [{ id: "due-1", accountId: "other-org" }],
        auditIntents: [
          {
            action: "ORGANIZATION_INVITATION_EXPIRED" as const,
            accountId: "other-org",
            targetType: "Invitation" as const,
            targetId: "due-1",
          },
        ],
      };
    }),
  };
  const accountAccess: AccountsAccountAccessCapability = {
    authorize: vi.fn(async () => {
      order.push("authorize");
      return accessResult;
    }),
  };
  const repository: AccountsInvitationListRepository = {
    listByAccountId: vi.fn(async () => {
      order.push("list");
      return [
        {
          id: "accepted-1",
          accountId: "org-1",
          email: "accepted@example.com",
          role: "MEMBER" as const,
          status: "ACCEPTED" as const,
          expiresAt: new Date("2026-09-10T00:00:00.000Z"),
          createdAt: new Date("2026-09-02T00:00:00.000Z"),
        },
        {
          id: "pending-1",
          accountId: "org-1",
          email: "pending@example.com",
          role: "BILLING" as const,
          status: "PENDING" as const,
          expiresAt: new Date("2026-09-20T00:00:00.000Z"),
          createdAt: new Date("2026-09-01T00:00:00.000Z"),
        },
      ];
    }),
  };
  return {
    order,
    expiration,
    accountAccess,
    repository,
    capability: createAccountsInvitationListCapability(expiration, accountAccess, repository),
  };
}

describe("Accounts invitation list", () => {
  it("expires globally before authorization, then returns all invitation statuses", async () => {
    const f = fixture();
    const result = await f.capability.list({
      actorPrincipalId: " owner-1 ",
      accountId: " org-1 ",
    });

    expect(result.status).toBe("LISTED");
    if (result.status !== "LISTED") return;
    expect(f.order).toEqual(["expire", "authorize", "list"]);
    expect(result.invitations.map((invitation) => invitation.status)).toEqual([
      "ACCEPTED",
      "PENDING",
    ]);
    expect(result.expiration.count).toBe(1);
    expect(result.expiration.auditIntents[0]?.targetId).toBe("due-1");
    expect(f.accountAccess.authorize).toHaveBeenCalledWith({
      principalId: "owner-1",
      accountId: "org-1",
      requiredCapability: "MANAGE_MEMBERS",
    });
    expect(f.repository.listByAccountId).toHaveBeenCalledWith("org-1");
  });

  it("preserves expiration side effects when authorization rejects", async () => {
    const f = fixture({ status: "REJECTED", code: "ACCOUNT_ROLE_FORBIDDEN" });
    const result = await f.capability.list({
      actorPrincipalId: "member-1",
      accountId: "org-1",
    });

    expect(result).toMatchObject({
      status: "REJECTED",
      code: "ACCOUNT_ROLE_FORBIDDEN",
      expiration: { count: 1 },
    });
    expect(f.order).toEqual(["expire", "authorize"]);
    expect(f.repository.listByAccountId).not.toHaveBeenCalled();
  });

  it("rejects INDIVIDUAL accounts only after the V1-compatible expiration sweep", async () => {
    const f = fixture(authorized(account({ type: "INDIVIDUAL" })));
    const result = await f.capability.list({
      actorPrincipalId: "owner-1",
      accountId: "org-1",
    });

    expect(result).toMatchObject({
      status: "REJECTED",
      code: "ACCOUNT_NOT_ORGANIZATION",
      expiration: { count: 1 },
    });
    expect(f.order).toEqual(["expire", "authorize"]);
  });

  it("does not impose mutable-lifecycle guards on organization listing", async () => {
    const f = fixture(authorized(account({ lifecycleState: "SUSPENDED" })));
    expect(
      await f.capability.list({ actorPrincipalId: "owner-1", accountId: "org-1" }),
    ).toMatchObject({ status: "LISTED" });
    expect(f.order).toEqual(["expire", "authorize", "list"]);
  });

  it("rejects invalid input before any expiration side effect", async () => {
    const f = fixture();
    expect(
      await f.capability.list({ actorPrincipalId: " ", accountId: "org-1" }),
    ).toEqual({ status: "FAILED", code: "INVALID_INPUT" });
    expect(f.expiration.expire).not.toHaveBeenCalled();
  });

  it("stops when expiration fails and maps later persistence failures", async () => {
    const expirationFailure = fixture();
    expirationFailure.expiration.expire = vi.fn(async () => ({
      status: "FAILED" as const,
      code: "CLOCK_UNAVAILABLE" as const,
    }));
    expect(
      await createAccountsInvitationListCapability(
        expirationFailure.expiration,
        expirationFailure.accountAccess,
        expirationFailure.repository,
      ).list({ actorPrincipalId: "owner-1", accountId: "org-1" }),
    ).toEqual({ status: "FAILED", code: "EXPIRATION_UNAVAILABLE" });
    expect(expirationFailure.accountAccess.authorize).not.toHaveBeenCalled();

    const repositoryFailure = fixture();
    repositoryFailure.repository.listByAccountId = vi.fn(async () => {
      throw new Error("database unavailable");
    });
    expect(
      await createAccountsInvitationListCapability(
        repositoryFailure.expiration,
        repositoryFailure.accountAccess,
        repositoryFailure.repository,
      ).list({ actorPrincipalId: "owner-1", accountId: "org-1" }),
    ).toMatchObject({
      status: "FAILED",
      code: "PERSISTENCE_UNAVAILABLE",
      expiration: { count: 1 },
    });
  });
});

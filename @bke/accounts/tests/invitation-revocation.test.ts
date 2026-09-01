import { describe, expect, it, vi } from "vitest";
import type {
  AccountsAccountAccessCapability,
  AccountsAccountAccessResult,
} from "../contracts/account-access.contract";
import type { AccountsInvitationRevocationRepository } from "../logic/invitation-revocation-repository";
import { createAccountsInvitationRevocationCapability } from "../logic/invitation-revocation";

const account = {
  id: "org-1",
  type: "ORGANIZATION" as const,
  displayName: "Example Org",
  ownerId: "owner-1",
  billingEmail: "billing@example.com",
  taxId: null,
  lifecycleState: "ACTIVE" as const,
};

function access(result?: AccountsAccountAccessResult): AccountsAccountAccessCapability {
  return {
    authorize: vi.fn(async (): Promise<AccountsAccountAccessResult> =>
      result ?? { status: "AUTHORIZED", account, effectiveRole: "OWNER" }),
  };
}

function repository(
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED" = "PENDING",
): AccountsInvitationRevocationRepository {
  return {
    findInvitation: vi.fn(async () => ({ id: "inv-1", accountId: "org-1", status })),
    revokePendingInvitation: vi.fn(async () => ({
      id: "inv-1",
      accountId: "org-1",
      email: "invite@example.com",
      role: "BILLING" as const,
      status: "REVOKED" as const,
      expiresAt: new Date("2026-01-08T00:00:00.000Z"),
      createdAt: new Date("2025-12-01T00:00:00.000Z"),
    })),
  };
}

describe("Accounts invitation revocation", () => {
  it("revokes only a pending invitation and returns audit intent", async () => {
    const accountAccess = access();
    const repo = repository();
    const result = await createAccountsInvitationRevocationCapability(accountAccess, repo).revoke({
      actorPrincipalId: " owner-1 ",
      invitationId: " inv-1 ",
    });

    expect(result).toEqual({
      status: "REVOKED",
      invitation: {
        id: "inv-1",
        accountId: "org-1",
        email: "invite@example.com",
        role: "BILLING",
        status: "REVOKED",
        expiresAt: new Date("2026-01-08T00:00:00.000Z"),
        createdAt: new Date("2025-12-01T00:00:00.000Z"),
      },
      auditIntent: {
        action: "ORGANIZATION_INVITATION_REVOKED",
        targetType: "Invitation",
        targetId: "inv-1",
      },
    });
    expect(accountAccess.authorize).toHaveBeenCalledWith({
      principalId: "owner-1",
      accountId: "org-1",
      requiredCapability: "MANAGE_MEMBERS",
    });
    expect(repo.revokePendingInvitation).toHaveBeenCalledWith("inv-1");
  });

  it("returns INVITATION_NOT_FOUND before authorization", async () => {
    const accountAccess = access();
    const repo: AccountsInvitationRevocationRepository = {
      findInvitation: vi.fn(async () => null),
      revokePendingInvitation: vi.fn(),
    };
    await expect(
      createAccountsInvitationRevocationCapability(accountAccess, repo).revoke({
        actorPrincipalId: "owner-1",
        invitationId: "missing",
      }),
    ).resolves.toEqual({ status: "REJECTED", code: "INVITATION_NOT_FOUND" });
    expect(accountAccess.authorize).not.toHaveBeenCalled();
    expect(repo.revokePendingInvitation).not.toHaveBeenCalled();
  });

  it("authorizes before reporting an existing non-pending invitation", async () => {
    await expect(
      createAccountsInvitationRevocationCapability(
        access({ status: "REJECTED", code: "ACCOUNT_ROLE_FORBIDDEN" }),
        repository("ACCEPTED"),
      ).revoke({ actorPrincipalId: "member-1", invitationId: "inv-1" }),
    ).resolves.toEqual({ status: "REJECTED", code: "ACCOUNT_ROLE_FORBIDDEN" });
  });

  it("rejects non-pending invitations and blocked organization lifecycles", async () => {
    for (const status of ["ACCEPTED", "REVOKED", "EXPIRED"] as const) {
      await expect(
        createAccountsInvitationRevocationCapability(access(), repository(status)).revoke({
          actorPrincipalId: "owner-1",
          invitationId: "inv-1",
        }),
      ).resolves.toEqual({ status: "REJECTED", code: "INVITATION_NOT_PENDING" });
    }
    for (const lifecycleState of ["SUSPENDED", "CLOSED", "CLOSURE_REQUESTED"] as const) {
      const result: AccountsAccountAccessResult = {
        status: "AUTHORIZED",
        account: { ...account, lifecycleState },
        effectiveRole: "OWNER",
      };
      const expected = lifecycleState === "SUSPENDED" ? "SUSPENDED_ACCOUNT" : "CLOSED_ACCOUNT";
      await expect(
        createAccountsInvitationRevocationCapability(access(result), repository()).revoke({
          actorPrincipalId: "owner-1",
          invitationId: "inv-1",
        }),
      ).resolves.toEqual({ status: "REJECTED", code: expected });
    }
  });

  it("maps a concurrent status change to INVITATION_NOT_PENDING", async () => {
    const repo = repository();
    repo.revokePendingInvitation = vi.fn(async () => null);
    await expect(
      createAccountsInvitationRevocationCapability(access(), repo).revoke({
        actorPrincipalId: "owner-1",
        invitationId: "inv-1",
      }),
    ).resolves.toEqual({ status: "REJECTED", code: "INVITATION_NOT_PENDING" });
  });

  it("maps validation, lookup, access, and mutation failures to typed results", async () => {
    await expect(
      createAccountsInvitationRevocationCapability(access(), repository()).revoke({
        actorPrincipalId: "",
        invitationId: "inv-1",
      }),
    ).resolves.toEqual({ status: "FAILED", code: "INVALID_INPUT" });

    await expect(
      createAccountsInvitationRevocationCapability(
        access(),
        { findInvitation: async () => { throw new Error("db"); }, revokePendingInvitation: vi.fn() },
      ).revoke({ actorPrincipalId: "owner-1", invitationId: "inv-1" }),
    ).resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });

    await expect(
      createAccountsInvitationRevocationCapability(
        access({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" }),
        repository(),
      ).revoke({ actorPrincipalId: "owner-1", invitationId: "inv-1" }),
    ).resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });

    await expect(
      createAccountsInvitationRevocationCapability(
        access(),
        {
          findInvitation: async () => ({ id: "inv-1", accountId: "org-1", status: "PENDING" }),
          revokePendingInvitation: async () => { throw new Error("db"); },
        },
      ).revoke({ actorPrincipalId: "owner-1", invitationId: "inv-1" }),
    ).resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});

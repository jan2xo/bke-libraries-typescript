import { describe, expect, it, vi } from "vitest";
import type {
  AccountsAccountAccessCapability,
  AccountsAccountAccessResult,
} from "../contracts/account-access.contract";
import type { AccountsInvitationResendRepository } from "../logic/invitation-resend-repository";
import { createAccountsInvitationResendCapability } from "../logic/invitation-resend";

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

function repository(status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED" = "PENDING"):
  AccountsInvitationResendRepository {
  return {
    findInvitation: vi.fn(async () => ({ id: "inv-1", accountId: "org-1", status })),
    updatePendingInvitation: vi.fn(async (update) => ({
      id: update.id,
      accountId: "org-1",
      email: "invite@example.com",
      role: "BILLING" as const,
      status: "PENDING" as const,
      expiresAt: update.expiresAt,
      createdAt: new Date("2025-12-01T00:00:00.000Z"),
    })),
  };
}

const tokenProvider = {
  issue: vi.fn(() => ({ rawToken: "new-raw-token", tokenHash: "new-token-hash" })),
};
const clock = { now: vi.fn(() => new Date("2026-01-01T00:00:00.000Z")) };

describe("Accounts invitation resend", () => {
  it("rotates token material and resets default expiry to seven days", async () => {
    const accountAccess = access();
    const repo = repository();
    const result = await createAccountsInvitationResendCapability(
      accountAccess,
      repo,
      tokenProvider,
      clock,
    ).resend({ actorPrincipalId: " owner-1 ", invitationId: " inv-1 " });

    expect(result).toEqual({
      status: "RESENT",
      invitation: {
        id: "inv-1",
        accountId: "org-1",
        email: "invite@example.com",
        role: "BILLING",
        status: "PENDING",
        expiresAt: new Date("2026-01-08T00:00:00.000Z"),
        createdAt: new Date("2025-12-01T00:00:00.000Z"),
      },
      token: "new-raw-token",
      auditIntent: {
        action: "ORGANIZATION_INVITATION_RESENT",
        targetType: "Invitation",
        targetId: "inv-1",
      },
    });
    expect(accountAccess.authorize).toHaveBeenCalledWith({
      principalId: "owner-1",
      accountId: "org-1",
      requiredCapability: "MANAGE_MEMBERS",
    });
    expect(repo.updatePendingInvitation).toHaveBeenCalledWith({
      id: "inv-1",
      tokenHash: "new-token-hash",
      expiresAt: new Date("2026-01-08T00:00:00.000Z"),
    });
  });

  it("preserves an explicit expiry exactly", async () => {
    const repo = repository();
    const expiresAt = new Date("2025-12-31T00:00:00.000Z");
    const result = await createAccountsInvitationResendCapability(
      access(), repo, tokenProvider, clock,
    ).resend({
      actorPrincipalId: "owner-1",
      invitationId: "inv-1",
      expiresAt,
    });
    expect(result).toMatchObject({ status: "RESENT", invitation: { expiresAt } });
  });

  it("returns INVITATION_NOT_FOUND before authorization or generation", async () => {
    const accountAccess = access();
    const localToken = { issue: vi.fn(() => ({ rawToken: "x", tokenHash: "y" })) };
    const repo: AccountsInvitationResendRepository = {
      findInvitation: vi.fn(async () => null),
      updatePendingInvitation: vi.fn(),
    };
    await expect(
      createAccountsInvitationResendCapability(accountAccess, repo, localToken, clock).resend({
        actorPrincipalId: "owner-1",
        invitationId: "missing",
      }),
    ).resolves.toEqual({ status: "REJECTED", code: "INVITATION_NOT_FOUND" });
    expect(accountAccess.authorize).not.toHaveBeenCalled();
    expect(localToken.issue).not.toHaveBeenCalled();
  });

  it("authorizes before reporting a non-pending existing invitation", async () => {
    const accountAccess = access({ status: "REJECTED", code: "ACCOUNT_ROLE_FORBIDDEN" });
    await expect(
      createAccountsInvitationResendCapability(
        accountAccess, repository("ACCEPTED"), tokenProvider, clock,
      ).resend({ actorPrincipalId: "member-1", invitationId: "inv-1" }),
    ).resolves.toEqual({ status: "REJECTED", code: "ACCOUNT_ROLE_FORBIDDEN" });
  });

  it("rejects non-pending state and blocked organization lifecycle before token generation", async () => {
    const localToken = { issue: vi.fn(() => ({ rawToken: "x", tokenHash: "y" })) };
    for (const status of ["ACCEPTED", "REVOKED", "EXPIRED"] as const) {
      await expect(
        createAccountsInvitationResendCapability(
          access(), repository(status), localToken, clock,
        ).resend({ actorPrincipalId: "owner-1", invitationId: "inv-1" }),
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
        createAccountsInvitationResendCapability(
          access(result), repository(), localToken, clock,
        ).resend({ actorPrincipalId: "owner-1", invitationId: "inv-1" }),
      ).resolves.toEqual({ status: "REJECTED", code: expected });
    }
    expect(localToken.issue).not.toHaveBeenCalled();
  });

  it("maps a concurrent status change to INVITATION_NOT_PENDING", async () => {
    const repo = repository();
    repo.updatePendingInvitation = vi.fn(async () => null);
    await expect(
      createAccountsInvitationResendCapability(access(), repo, tokenProvider, clock).resend({
        actorPrincipalId: "owner-1",
        invitationId: "inv-1",
      }),
    ).resolves.toEqual({ status: "REJECTED", code: "INVITATION_NOT_PENDING" });
  });

  it("maps input, generation, lookup, and update failures without leaking infrastructure errors", async () => {
    await expect(
      createAccountsInvitationResendCapability(access(), repository(), tokenProvider, clock).resend({
        actorPrincipalId: "",
        invitationId: "inv-1",
      }),
    ).resolves.toEqual({ status: "FAILED", code: "INVALID_INPUT" });

    await expect(
      createAccountsInvitationResendCapability(
        access(), repository(), { issue: () => { throw new Error("rng unavailable"); } }, clock,
      ).resend({ actorPrincipalId: "owner-1", invitationId: "inv-1" }),
    ).resolves.toEqual({ status: "FAILED", code: "GENERATION_FAILED" });

    await expect(
      createAccountsInvitationResendCapability(
        access(),
        { findInvitation: async () => { throw new Error("db"); }, updatePendingInvitation: vi.fn() },
        tokenProvider,
        clock,
      ).resend({ actorPrincipalId: "owner-1", invitationId: "inv-1" }),
    ).resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });

    await expect(
      createAccountsInvitationResendCapability(
        access(),
        { findInvitation: async () => ({ id: "inv-1", accountId: "org-1", status: "PENDING" }), updatePendingInvitation: async () => { throw new Error("db"); } },
        tokenProvider,
        clock,
      ).resend({ actorPrincipalId: "owner-1", invitationId: "inv-1" }),
    ).resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});

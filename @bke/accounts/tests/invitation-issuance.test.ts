import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type {
  AccountsAccountAccessCapability,
  AccountsAccountAccessResult,
} from "../contracts/account-access.contract";
import type { AccountsLifecycleState } from "../contracts/account.contract";
import { createAccountsInvitationIssuanceCapability } from "../logic/invitation-issuance";
import type { AccountsInvitationIssuanceRepository } from "../logic/invitation-issuance-repository";
import { createCryptoAccountsInvitationTokenProvider } from "../providers/crypto-invitation-token-provider";

const baseAccount = {
  id: "org-1",
  type: "ORGANIZATION" as const,
  displayName: "Example Org",
  ownerId: "owner-1",
  billingEmail: "billing@example.com",
  taxId: null,
  lifecycleState: "ACTIVE" as AccountsLifecycleState,
};

function access(result?: AccountsAccountAccessResult): AccountsAccountAccessCapability {
  return {
    authorize: vi.fn(async (): Promise<AccountsAccountAccessResult> =>
      result ?? { status: "AUTHORIZED", account: baseAccount, effectiveRole: "OWNER" }),
  };
}

function repository(): AccountsInvitationIssuanceRepository {
  return {
    createInvitation: vi.fn(async (record) => ({
      id: record.id,
      accountId: record.accountId,
      email: record.email,
      role: record.role,
      status: "PENDING" as const,
      expiresAt: record.expiresAt,
      createdAt: new Date("2026-01-01T00:00:01.000Z"),
    })),
  };
}

describe("Accounts invitation issuance", () => {
  it("normalizes email, preserves role, and defaults expiry to seven days", async () => {
    const accountAccess = access();
    const repo = repository();
    const capability = createAccountsInvitationIssuanceCapability(
      accountAccess,
      repo,
      { issue: () => "invitation-1" },
      { issue: () => ({ rawToken: "raw-token", tokenHash: "hashed-token" }) },
      { now: () => new Date("2026-01-01T00:00:00.000Z") },
    );
    const result = await capability.issue({
      actorPrincipalId: " owner-1 ",
      accountId: " org-1 ",
      email: " INVITED@EXAMPLE.COM ",
      role: "OWNER",
    });
    expect(result).toEqual({
      status: "ISSUED",
      invitation: {
        id: "invitation-1",
        accountId: "org-1",
        email: "invited@example.com",
        role: "OWNER",
        status: "PENDING",
        expiresAt: new Date("2026-01-08T00:00:00.000Z"),
        createdAt: new Date("2026-01-01T00:00:01.000Z"),
      },
      token: "raw-token",
      auditIntent: {
        action: "ORGANIZATION_INVITATION_CREATED",
        targetType: "Invitation",
        targetId: "invitation-1",
        metadata: { role: "OWNER" },
      },
    });
    expect(accountAccess.authorize).toHaveBeenCalledWith({
      principalId: "owner-1",
      accountId: "org-1",
      requiredCapability: "MANAGE_MEMBERS",
    });
    expect(repo.createInvitation).toHaveBeenCalledWith({
      id: "invitation-1",
      accountId: "org-1",
      email: "invited@example.com",
      role: "OWNER",
      tokenHash: "hashed-token",
      expiresAt: new Date("2026-01-08T00:00:00.000Z"),
    });
  });

  it("preserves explicit expiry exactly and V1 mutability behavior for PRIVACY_REVIEW", async () => {
    const expiresAt = new Date("2025-12-31T00:00:00.000Z");
    const result = await createAccountsInvitationIssuanceCapability(
      access({
        status: "AUTHORIZED",
        account: { ...baseAccount, lifecycleState: "PRIVACY_REVIEW" },
        effectiveRole: "OWNER",
      }),
      repository(),
      { issue: () => "invitation-2" },
      { issue: () => ({ rawToken: "raw-token", tokenHash: "hashed-token" }) },
      { now: () => new Date("2026-01-01T00:00:00.000Z") },
    ).issue({
      actorPrincipalId: "owner-1",
      accountId: "org-1",
      email: "invite@example.com",
      role: "BILLING",
      expiresAt,
    });
    expect(result).toMatchObject({ status: "ISSUED", invitation: { expiresAt } });
  });

  it("rejects authorization, wrong type, and blocked lifecycle before generation", async () => {
    const cases: AccountsAccountAccessResult[] = [
      { status: "REJECTED", code: "ACCOUNT_ROLE_FORBIDDEN" },
      { status: "AUTHORIZED", account: { ...baseAccount, type: "INDIVIDUAL" }, effectiveRole: "OWNER" },
      { status: "AUTHORIZED", account: { ...baseAccount, lifecycleState: "SUSPENDED" }, effectiveRole: "OWNER" },
      { status: "AUTHORIZED", account: { ...baseAccount, lifecycleState: "CLOSED" }, effectiveRole: "OWNER" },
    ];
    for (const accessResult of cases) {
      const idProvider = { issue: vi.fn(() => "never") };
      const tokenProvider = { issue: vi.fn(() => ({ rawToken: "never", tokenHash: "never" })) };
      await createAccountsInvitationIssuanceCapability(
        access(accessResult),
        repository(),
        idProvider,
        tokenProvider,
        { now: () => new Date() },
      ).issue({
        actorPrincipalId: "principal-1",
        accountId: "org-1",
        email: "invite@example.com",
        role: "MEMBER",
      });
      expect(idProvider.issue).not.toHaveBeenCalled();
      expect(tokenProvider.issue).not.toHaveBeenCalled();
    }
  });

  it("maps invalid input, generation failure, and persistence failure", async () => {
    const common = {
      actorPrincipalId: "owner-1",
      accountId: "org-1",
      email: "invite@example.com",
      role: "MEMBER" as const,
    };
    await expect(
      createAccountsInvitationIssuanceCapability(
        access(), repository(), { issue: () => "id" },
        { issue: () => ({ rawToken: "raw", tokenHash: "hash" }) },
        { now: () => new Date() },
      ).issue({ ...common, email: "not-an-email" }),
    ).resolves.toEqual({ status: "FAILED", code: "INVALID_INPUT" });

    await expect(
      createAccountsInvitationIssuanceCapability(
        access(), repository(), { issue: () => { throw new Error("rng unavailable"); } },
        { issue: () => ({ rawToken: "raw", tokenHash: "hash" }) },
        { now: () => new Date() },
      ).issue(common),
    ).resolves.toEqual({ status: "FAILED", code: "GENERATION_FAILED" });

    await expect(
      createAccountsInvitationIssuanceCapability(
        access(),
        { createInvitation: vi.fn(async () => { throw new Error("database unavailable"); }) },
        { issue: () => "id" },
        { issue: () => ({ rawToken: "raw", tokenHash: "hash" }) },
        { now: () => new Date() },
      ).issue(common),
    ).resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });

  it("crypto provider emits 32 random bytes as base64url and SHA-256-only material", () => {
    const material = createCryptoAccountsInvitationTokenProvider().issue();
    expect(Buffer.from(material.rawToken, "base64url")).toHaveLength(32);
    expect(material.rawToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(material.tokenHash).toBe(createHash("sha256").update(material.rawToken).digest("hex"));
    expect(material.tokenHash).not.toBe(material.rawToken);
  });
});

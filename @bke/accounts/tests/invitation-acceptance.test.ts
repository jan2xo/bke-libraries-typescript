import { describe, expect, it, vi } from "vitest";
import { createAccountsInvitationAcceptanceCapability } from "../logic/invitation-acceptance";
import type { AccountsInvitationAcceptanceRepository } from "../logic/invitation-acceptance-repository";

const now = new Date("2026-01-10T00:00:00.000Z");

function createCapability(repository: AccountsInvitationAcceptanceRepository) {
  return createAccountsInvitationAcceptanceCapability(
    repository,
    { hash: (rawToken) => `hash:${rawToken}` },
    { now: () => now },
  );
}

describe("Accounts invitation acceptance", () => {
  it("normalizes email, hashes the raw token, and returns host-owned audit intent", async () => {
    const accept = vi.fn(async () => ({
      status: "ACCEPTED" as const,
      invitationId: "invite-1",
      membership: {
        accountId: "org-1",
        userId: "principal-1",
        role: "BILLING" as const,
        createdAt: now,
      },
    }));
    const result = await createCapability({ accept }).accept({
      principalId: "principal-1",
      email: "Member@Example.COM",
      token: "raw-token",
    });

    expect(accept).toHaveBeenCalledWith({
      principalId: "principal-1",
      email: "member@example.com",
      tokenHash: "hash:raw-token",
      now,
    });
    expect(result).toEqual({
      status: "ACCEPTED",
      membership: {
        accountId: "org-1",
        userId: "principal-1",
        role: "BILLING",
        createdAt: now,
      },
      auditIntent: {
        action: "ORGANIZATION_INVITATION_ACCEPTED",
        accountId: "org-1",
        targetType: "Membership",
        targetId: "principal-1",
        invitationId: "invite-1",
        role: "BILLING",
      },
    });
  });

  it("preserves repository rejection classification", async () => {
    const repository: AccountsInvitationAcceptanceRepository = {
      accept: vi.fn(async () => ({
        status: "REJECTED" as const,
        code: "INVITATION_EXPIRED" as const,
      })),
    };
    await expect(
      createCapability(repository).accept({
        principalId: "principal-1",
        email: "member@example.com",
        token: "raw-token",
      }),
    ).resolves.toEqual({ status: "REJECTED", code: "INVITATION_EXPIRED" });
  });

  it("rejects invalid input before hashing or persistence", async () => {
    const accept = vi.fn();
    const hash = vi.fn((value: string) => value);
    const capability = createAccountsInvitationAcceptanceCapability(
      { accept },
      { hash },
      { now: () => now },
    );
    await expect(
      capability.accept({ principalId: "", email: "member@example.com", token: "token" }),
    ).resolves.toEqual({ status: "FAILED", code: "INVALID_INPUT" });
    expect(hash).not.toHaveBeenCalled();
    expect(accept).not.toHaveBeenCalled();
  });

  it("fails closed when hashing or clock generation is unavailable", async () => {
    const repository: AccountsInvitationAcceptanceRepository = { accept: vi.fn() };
    const hashFailure = createAccountsInvitationAcceptanceCapability(
      repository,
      { hash: () => { throw new Error("hash unavailable"); } },
      { now: () => now },
    );
    await expect(
      hashFailure.accept({ principalId: "p", email: "e", token: "t" }),
    ).resolves.toEqual({ status: "FAILED", code: "TOKEN_HASH_UNAVAILABLE" });

    const clockFailure = createAccountsInvitationAcceptanceCapability(
      repository,
      { hash: () => "hash" },
      { now: () => new Date(Number.NaN) },
    );
    await expect(
      clockFailure.accept({ principalId: "p", email: "e", token: "t" }),
    ).resolves.toEqual({ status: "FAILED", code: "CLOCK_UNAVAILABLE" });
  });

  it("maps repository exceptions to persistence failure", async () => {
    const repository: AccountsInvitationAcceptanceRepository = {
      accept: vi.fn(async () => { throw new Error("db unavailable"); }),
    };
    await expect(
      createCapability(repository).accept({ principalId: "p", email: "e", token: "t" }),
    ).resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});

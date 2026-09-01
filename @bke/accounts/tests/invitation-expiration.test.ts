import { describe, expect, it, vi } from "vitest";
import type { AccountsInvitationExpirationRepository } from "../logic/invitation-expiration-repository";
import { createAccountsInvitationExpirationCapability } from "../logic/invitation-expiration";

function repository(): AccountsInvitationExpirationRepository {
  return {
    expirePendingAt: vi.fn(async () => [
      { id: "inv-1", accountId: "org-1" },
      { id: "inv-2", accountId: "org-2" },
    ]),
  };
}

describe("Accounts invitation expiration", () => {
  it("expires the batch at the injected clock and returns host-owned audit intents", async () => {
    const repo = repository();
    const now = new Date("2026-01-01T00:00:00.000Z");
    const result = await createAccountsInvitationExpirationCapability(
      repo,
      { now: () => now },
    ).expire();

    expect(repo.expirePendingAt).toHaveBeenCalledWith(now);
    expect(result).toEqual({
      status: "EXPIRED",
      count: 2,
      invitations: [
        { id: "inv-1", accountId: "org-1" },
        { id: "inv-2", accountId: "org-2" },
      ],
      auditIntents: [
        {
          action: "ORGANIZATION_INVITATION_EXPIRED",
          accountId: "org-1",
          targetType: "Invitation",
          targetId: "inv-1",
        },
        {
          action: "ORGANIZATION_INVITATION_EXPIRED",
          accountId: "org-2",
          targetType: "Invitation",
          targetId: "inv-2",
        },
      ],
    });
  });

  it("preserves an explicit now exactly and does not consult the clock", async () => {
    const repo = repository();
    const clock = { now: vi.fn(() => new Date("2099-01-01T00:00:00.000Z")) };
    const now = new Date("2026-02-03T04:05:06.000Z");
    await createAccountsInvitationExpirationCapability(repo, clock).expire({ now });
    expect(repo.expirePendingAt).toHaveBeenCalledWith(now);
    expect(clock.now).not.toHaveBeenCalled();
  });

  it("maps invalid time, clock failure, and persistence failure without leaking infrastructure errors", async () => {
    await expect(
      createAccountsInvitationExpirationCapability(repository(), { now: () => new Date() }).expire({
        now: new Date(Number.NaN),
      }),
    ).resolves.toEqual({ status: "FAILED", code: "INVALID_INPUT" });

    await expect(
      createAccountsInvitationExpirationCapability(repository(), {
        now: () => { throw new Error("clock"); },
      }).expire(),
    ).resolves.toEqual({ status: "FAILED", code: "CLOCK_UNAVAILABLE" });

    await expect(
      createAccountsInvitationExpirationCapability(
        { expirePendingAt: async () => { throw new Error("db"); } },
        { now: () => new Date() },
      ).expire(),
    ).resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});

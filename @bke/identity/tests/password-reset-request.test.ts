import { describe, expect, it, vi } from "vitest";
import { createIdentityPasswordResetRequestCapability } from "../logic/password-reset-request";
import type { IdentityPasswordResetRequestRepository } from "../logic/password-reset-request-repository";
import type { IdentityPasswordResetTokenProvider } from "../logic/password-reset-token-provider";

const now = new Date("2026-08-31T05:00:00.000Z");

function harness(found = true) {
  const repository: IdentityPasswordResetRequestRepository = {
    findPrincipalByEmail: vi.fn(async () =>
      found ? { id: "user-1", email: "user@example.com" } : null,
    ),
    createToken: vi.fn(async () => undefined),
  };
  const tokenProvider: IdentityPasswordResetTokenProvider = {
    issue: vi.fn(() => ({
      tokenId: "reset-1",
      token: "raw-reset-token",
      tokenHash: "hashed-reset-token",
    })),
    hash: vi.fn(() => "hashed-reset-token"),
  };
  return {
    repository,
    tokenProvider,
    capability: createIdentityPasswordResetRequestCapability(
      repository,
      tokenProvider,
      () => now,
    ),
  };
}

describe("Identity password-reset request", () => {
  it("normalizes email and persists only hashed token material with a 30-minute TTL", async () => {
    const h = harness();
    const result = await h.capability.request({ email: "  USER@EXAMPLE.COM " });
    expect(result).toEqual({
      status: "ACCEPTED",
      delivery: { recipientEmail: "user@example.com", token: "raw-reset-token" },
    });
    expect(h.repository.findPrincipalByEmail).toHaveBeenCalledWith("user@example.com");
    expect(h.repository.createToken).toHaveBeenCalledWith({
      id: "reset-1",
      userId: "user-1",
      tokenHash: "hashed-reset-token",
      expiresAt: new Date(now.getTime() + 30 * 60_000),
    });
  });

  it("collapses a missing principal into ACCEPTED without issuing token material", async () => {
    const h = harness(false);
    await expect(h.capability.request({ email: "nobody@example.com" })).resolves.toEqual({
      status: "ACCEPTED",
      delivery: null,
    });
    expect(h.tokenProvider.issue).not.toHaveBeenCalled();
    expect(h.repository.createToken).not.toHaveBeenCalled();
  });

  it("rejects malformed email input before persistence", async () => {
    const h = harness();
    await expect(h.capability.request({ email: "not-an-email" })).resolves.toEqual({
      status: "FAILED",
      code: "INVALID_INPUT",
    });
    expect(h.repository.findPrincipalByEmail).not.toHaveBeenCalled();
  });
});

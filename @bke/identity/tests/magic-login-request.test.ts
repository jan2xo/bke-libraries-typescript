import { describe, expect, it, vi } from "vitest";
import { createIdentityMagicLoginRequestCapability } from "../logic/magic-login-request";
import type { IdentityMagicLoginRequestRepository } from "../logic/magic-login-request-repository";
import type { IdentityMagicLoginTokenProvider } from "../logic/magic-login-token-provider";

const now = new Date("2026-08-31T14:00:00.000Z");

function harness(found = true) {
  const repository: IdentityMagicLoginRequestRepository = {
    findEligibleCustomerByEmail: vi.fn(async () =>
      found ? { email: "user@example.com" } : null,
    ),
    replacePendingToken: vi.fn(async () => undefined),
  };
  const tokenProvider: IdentityMagicLoginTokenProvider = {
    issue: vi.fn(() => ({
      tokenId: "magic-1",
      token: "raw-magic-token",
      tokenHash: "hashed-magic-token",
    })),
    hash: vi.fn(() => "hashed-magic-token"),
  };
  return {
    repository,
    tokenProvider,
    capability: createIdentityMagicLoginRequestCapability(
      repository,
      tokenProvider,
      () => now,
    ),
  };
}

describe("Identity magic-login request", () => {
  it("normalizes email and atomically replaces pending MAGIC_LOGIN token state with a 15-minute token", async () => {
    const h = harness();
    const result = await h.capability.request({ email: "  USER@EXAMPLE.COM " });
    expect(result).toEqual({
      status: "ACCEPTED",
      delivery: { recipientEmail: "user@example.com", token: "raw-magic-token" },
    });
    expect(h.repository.findEligibleCustomerByEmail).toHaveBeenCalledWith("user@example.com");
    expect(h.repository.replacePendingToken).toHaveBeenCalledWith({
      id: "magic-1",
      identifier: "user@example.com",
      tokenHash: "hashed-magic-token",
      expiresAt: new Date(now.getTime() + 15 * 60_000),
      replacedAt: now,
    });
  });

  it("collapses a missing or ineligible principal into ACCEPTED without issuing token material", async () => {
    const h = harness(false);
    await expect(h.capability.request({ email: "nobody@example.com" })).resolves.toEqual({
      status: "ACCEPTED",
      delivery: null,
    });
    expect(h.tokenProvider.issue).not.toHaveBeenCalled();
    expect(h.repository.replacePendingToken).not.toHaveBeenCalled();
  });

  it("rejects malformed email input before persistence", async () => {
    const h = harness();
    await expect(h.capability.request({ email: "not-an-email" })).resolves.toEqual({
      status: "FAILED",
      code: "INVALID_INPUT",
    });
    expect(h.repository.findEligibleCustomerByEmail).not.toHaveBeenCalled();
  });

  it("returns typed provider and persistence failures", async () => {
    const providerFailure = harness();
    vi.mocked(providerFailure.tokenProvider.issue).mockImplementation(() => {
      throw new Error("provider unavailable");
    });
    await expect(providerFailure.capability.request({ email: "user@example.com" })).resolves.toEqual({
      status: "FAILED",
      code: "TOKEN_PROVIDER_UNAVAILABLE",
    });

    const persistenceFailure = harness();
    vi.mocked(persistenceFailure.repository.replacePendingToken).mockRejectedValue(
      new Error("postgres unavailable"),
    );
    await expect(persistenceFailure.capability.request({ email: "user@example.com" })).resolves.toEqual({
      status: "FAILED",
      code: "PERSISTENCE_UNAVAILABLE",
    });
  });
});

import { describe, expect, it, vi } from "vitest";
import { createIdentityEmailVerificationCompletionCapability } from "../logic/email-verification-completion";
import type { IdentityEmailVerificationCompletionRepository } from "../logic/email-verification-completion-repository";
import type { IdentityEmailVerificationTokenProvider } from "../logic/email-verification-token-provider";

const now = new Date("2026-09-01T07:30:00.000Z");

function harness() {
  const repository: IdentityEmailVerificationCompletionRepository = {
    completeVerification: vi.fn(async () => ({
      status: "VERIFIED" as const,
      userId: "user-1",
      email: "user@example.com",
    })),
  };
  const tokenProvider: IdentityEmailVerificationTokenProvider = {
    issue: vi.fn(() => ({
      tokenId: "unused",
      token: "unused",
      tokenHash: "unused",
    })),
    hash: vi.fn(() => "hashed-proof"),
  };

  return {
    repository,
    tokenProvider,
    capability: createIdentityEmailVerificationCompletionCapability(
      repository,
      tokenProvider,
      () => now,
    ),
  };
}

describe("Identity email verification completion", () => {
  it("hashes exact proof bytes and completes verification at one timestamp", async () => {
    const h = harness();
    const result = await h.capability.complete({ token: "  raw-proof  " });

    expect(result).toEqual({
      status: "VERIFIED",
      userId: "user-1",
      email: "user@example.com",
      verifiedAt: now,
    });
    expect(h.tokenProvider.hash).toHaveBeenCalledWith("  raw-proof  ");
    expect(h.repository.completeVerification).toHaveBeenCalledWith(
      "hashed-proof",
      now,
    );
  });

  it("rejects missing proof without invoking providers or persistence", async () => {
    const h = harness();
    await expect(h.capability.complete({ token: "" })).resolves.toEqual({
      status: "REJECTED",
      code: "INVALID_TOKEN",
    });
    expect(h.tokenProvider.hash).not.toHaveBeenCalled();
    expect(h.repository.completeVerification).not.toHaveBeenCalled();
  });

  it("preserves uniform invalid-token rejection", async () => {
    const h = harness();
    vi.mocked(h.repository.completeVerification).mockResolvedValue({
      status: "INVALID_TOKEN",
    });
    await expect(h.capability.complete({ token: "invalid" })).resolves.toEqual({
      status: "REJECTED",
      code: "INVALID_TOKEN",
    });
  });

  it("returns typed provider and persistence failures", async () => {
    const providerFailure = harness();
    vi.mocked(providerFailure.tokenProvider.hash).mockImplementation(() => {
      throw new Error("provider unavailable");
    });
    await expect(
      providerFailure.capability.complete({ token: "proof" }),
    ).resolves.toEqual({ status: "FAILED", code: "TOKEN_PROVIDER_UNAVAILABLE" });

    const persistenceFailure = harness();
    vi.mocked(persistenceFailure.repository.completeVerification).mockRejectedValue(
      new Error("postgres unavailable"),
    );
    await expect(
      persistenceFailure.capability.complete({ token: "proof" }),
    ).resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});

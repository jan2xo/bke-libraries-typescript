import { describe, expect, it, vi } from "vitest";
import { createIdentityPasswordResetCompletionCapability } from "../logic/password-reset-completion";
import type { IdentityPasswordResetCompletionRepository } from "../logic/password-reset-completion-repository";
import type { IdentityPasswordHasher } from "../logic/password-hasher";
import type { IdentityPasswordResetTokenProvider } from "../logic/password-reset-token-provider";

const now = new Date("2026-08-31T06:00:00.000Z");

function harness() {
  const repository: IdentityPasswordResetCompletionRepository = {
    findTokenByHash: vi.fn(async () => ({
      id: "reset-1",
      userId: "user-1",
      expiresAt: new Date(now.getTime() + 60_000),
      usedAt: null,
      role: "ADMIN" as const,
    })),
    complete: vi.fn(async () => ({ status: "COMPLETED" as const })),
  };
  const tokenProvider: IdentityPasswordResetTokenProvider = {
    issue: vi.fn(() => ({ tokenId: "new", token: "new-token", tokenHash: "new-hash" })),
    hash: vi.fn(() => "reset-hash"),
  };
  const passwordHasher: IdentityPasswordHasher = {
    hash: vi.fn(async () => "new-password-hash"),
  };
  return {
    repository,
    tokenProvider,
    passwordHasher,
    capability: createIdentityPasswordResetCompletionCapability(
      repository,
      tokenProvider,
      passwordHasher,
      () => now,
    ),
  };
}

describe("Identity password-reset completion", () => {
  it("hashes proof and commits password replacement with session revocation", async () => {
    const h = harness();
    const result = await h.capability.complete({
      token: "abcdefghijklmnopqrstuvwxyz",
      password: "NewPassword123",
    });
    expect(result).toEqual({ status: "COMPLETED", userId: "user-1", role: "ADMIN" });
    expect(h.repository.findTokenByHash).toHaveBeenCalledWith("reset-hash");
    expect(h.repository.complete).toHaveBeenCalledWith({
      tokenId: "reset-1",
      userId: "user-1",
      passwordHash: "new-password-hash",
      completedAt: now,
    });
  });

  it("rejects expired or consumed tokens before password hashing", async () => {
    const h = harness();
    vi.mocked(h.repository.findTokenByHash).mockResolvedValue({
      id: "reset-1",
      userId: "user-1",
      expiresAt: new Date(now.getTime() - 1),
      usedAt: null,
      role: "CUSTOMER",
    });
    await expect(h.capability.complete({
      token: "abcdefghijklmnopqrstuvwxyz",
      password: "NewPassword123",
    })).resolves.toEqual({ status: "INVALID", code: "INVALID_TOKEN" });
    expect(h.passwordHasher.hash).not.toHaveBeenCalled();
  });

  it("enforces the V1 reset password policy", async () => {
    const h = harness();
    await expect(h.capability.complete({
      token: "abcdefghijklmnopqrstuvwxyz",
      password: "weakpassword",
    })).resolves.toEqual({ status: "FAILED", code: "INVALID_INPUT" });
    expect(h.repository.findTokenByHash).not.toHaveBeenCalled();
  });

  it("fails closed on a commit-time token race", async () => {
    const h = harness();
    vi.mocked(h.repository.complete).mockResolvedValue({ status: "TOKEN_REJECTED" });
    await expect(h.capability.complete({
      token: "abcdefghijklmnopqrstuvwxyz",
      password: "NewPassword123",
    })).resolves.toEqual({ status: "INVALID", code: "INVALID_TOKEN" });
  });
});

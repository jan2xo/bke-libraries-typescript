import { describe, expect, it, vi } from "vitest";
import type { IdentitySessionTerminationRepository } from "../logic/session-termination-repository";
import { createIdentitySessionTerminationCapability } from "../logic/session-termination";
import type { IdentitySessionTokenProvider } from "../logic/session-token-provider";

const now = new Date("2026-08-31T02:00:00.000Z");

function tokenProvider(): IdentitySessionTokenProvider {
  return {
    issue: vi.fn(),
    hash: vi.fn((token: string) => `hashed:${token}`),
  };
}

function repository(): IdentitySessionTerminationRepository {
  return {
    terminateSessionByTokenHash: vi.fn(async () => undefined),
  };
}

describe("Identity session termination", () => {
  it("returns NO_SESSION for blank boundary input without hashing", async () => {
    const tokens = tokenProvider();
    const termination = createIdentitySessionTerminationCapability(repository(), tokens, () => now);
    await expect(termination.terminate("   ")).resolves.toEqual({ status: "NO_SESSION" });
    expect(tokens.hash).not.toHaveBeenCalled();
  });

  it("hashes the raw token and terminates through the narrow persistence port", async () => {
    const tokens = tokenProvider();
    const repo = repository();
    const termination = createIdentitySessionTerminationCapability(repo, tokens, () => now);
    await expect(termination.terminate("raw-token")).resolves.toEqual({ status: "TERMINATED" });
    expect(tokens.hash).toHaveBeenCalledWith("raw-token");
    expect(repo.terminateSessionByTokenHash).toHaveBeenCalledWith("hashed:raw-token", now);
  });

  it("does not expose whether a nonblank token matched a live session", async () => {
    const termination = createIdentitySessionTerminationCapability(repository(), tokenProvider(), () => now);
    await expect(termination.terminate("unknown-token")).resolves.toEqual({ status: "TERMINATED" });
  });

  it("maps hashing and persistence failures to typed fail-closed results", async () => {
    const brokenTokens: IdentitySessionTokenProvider = {
      issue: vi.fn(),
      hash: vi.fn(() => { throw new Error("hash unavailable"); }),
    };
    const hashFailure = createIdentitySessionTerminationCapability(repository(), brokenTokens, () => now);
    await expect(hashFailure.terminate("raw-token")).resolves.toEqual({
      status: "FAILED",
      code: "TOKEN_PROVIDER_UNAVAILABLE",
    });

    const brokenRepository: IdentitySessionTerminationRepository = {
      terminateSessionByTokenHash: vi.fn(async () => { throw new Error("database unavailable"); }),
    };
    const persistenceFailure = createIdentitySessionTerminationCapability(
      brokenRepository,
      tokenProvider(),
      () => now,
    );
    await expect(persistenceFailure.terminate("raw-token")).resolves.toEqual({
      status: "FAILED",
      code: "PERSISTENCE_UNAVAILABLE",
    });
  });
});

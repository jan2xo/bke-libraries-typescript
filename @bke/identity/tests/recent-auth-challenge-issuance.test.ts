import { describe, expect, it, vi } from "vitest";
import type { IdentityEmailMfaChallengeMaterialProvider } from "../logic/email-mfa-challenge-material-provider";
import { createIdentityRecentAuthChallengeIssuanceCapability } from "../logic/recent-auth-challenge-issuance";
import type {
  IdentityRecentAuthChallengePersistenceInput,
  IdentityRecentAuthChallengeRepository,
} from "../logic/recent-auth-challenge-repository";

const now = new Date("2026-08-31T08:00:00.000Z");

function materialProvider(
  overrides: Partial<IdentityEmailMfaChallengeMaterialProvider> = {},
): IdentityEmailMfaChallengeMaterialProvider {
  return {
    issue: vi.fn(() => ({
      challengeId: "recent-challenge-1",
      token: "raw-recent-token",
      tokenHash: "hashed-recent-token",
      code: "654321",
      codeHash: "hashed-recent-code",
      reference: "DEF456",
    })),
    ...overrides,
  };
}

function repository(
  overrides: Partial<IdentityRecentAuthChallengeRepository> = {},
): IdentityRecentAuthChallengeRepository {
  return {
    replacePendingRecentAuthChallenge: vi.fn(async () => ({
      status: "CREATED" as const,
      recipientEmail: "admin@example.com",
    })),
    ...overrides,
  };
}

describe("Identity recent-auth challenge issuance", () => {
  it("issues a 10-minute RECENT_AUTH challenge while persisting hashes only", async () => {
    let persisted: IdentityRecentAuthChallengePersistenceInput | undefined;
    const repo = repository({
      replacePendingRecentAuthChallenge: vi.fn(async (input) => {
        persisted = input;
        return {
          status: "CREATED" as const,
          recipientEmail: "admin@example.com",
        };
      }),
    });
    const capability = createIdentityRecentAuthChallengeIssuanceCapability(
      repo,
      materialProvider(),
      () => now,
    );

    const result = await capability.issue({ userId: " admin-1 " });

    expect(result).toEqual({
      status: "ISSUED",
      challenge: {
        challengeToken: "raw-recent-token",
        expiresAt: new Date("2026-08-31T08:10:00.000Z"),
        delivery: {
          recipientEmail: "admin@example.com",
          code: "654321",
          reference: "DEF456",
        },
      },
    });
    expect(persisted).toEqual({
      challengeId: "recent-challenge-1",
      userId: "admin-1",
      tokenHash: "hashed-recent-token",
      codeHash: "hashed-recent-code",
      expiresAt: new Date("2026-08-31T08:10:00.000Z"),
    });
    expect(JSON.stringify(persisted)).not.toContain("raw-recent-token");
    expect(JSON.stringify(persisted)).not.toContain("654321");
  });

  it("maps missing and non-admin principals without returning challenge material", async () => {
    const missing = createIdentityRecentAuthChallengeIssuanceCapability(
      repository({
        replacePendingRecentAuthChallenge: vi.fn(async () => ({
          status: "PRINCIPAL_NOT_FOUND" as const,
        })),
      }),
      materialProvider(),
      () => now,
    );
    const forbidden = createIdentityRecentAuthChallengeIssuanceCapability(
      repository({
        replacePendingRecentAuthChallenge: vi.fn(async () => ({
          status: "FORBIDDEN" as const,
        })),
      }),
      materialProvider(),
      () => now,
    );

    await expect(missing.issue({ userId: "missing" })).resolves.toEqual({
      status: "REJECTED",
      code: "PRINCIPAL_NOT_FOUND",
    });
    await expect(forbidden.issue({ userId: "customer-1" })).resolves.toEqual({
      status: "REJECTED",
      code: "FORBIDDEN",
    });
  });

  it("rejects blank user ids before generating secret material", async () => {
    const material = materialProvider();
    const repo = repository();
    const capability = createIdentityRecentAuthChallengeIssuanceCapability(
      repo,
      material,
      () => now,
    );

    await expect(capability.issue({ userId: "   " })).resolves.toEqual({
      status: "FAILED",
      code: "INVALID_INPUT",
    });
    expect(material.issue).not.toHaveBeenCalled();
    expect(repo.replacePendingRecentAuthChallenge).not.toHaveBeenCalled();
  });

  it("maps material and persistence failures to typed fail-closed results", async () => {
    const materialFailure = createIdentityRecentAuthChallengeIssuanceCapability(
      repository(),
      materialProvider({
        issue: vi.fn(() => {
          throw new Error("entropy unavailable");
        }),
      }),
      () => now,
    );
    const persistenceFailure = createIdentityRecentAuthChallengeIssuanceCapability(
      repository({
        replacePendingRecentAuthChallenge: vi.fn(async () => {
          throw new Error("database unavailable");
        }),
      }),
      materialProvider(),
      () => now,
    );

    await expect(materialFailure.issue({ userId: "admin-1" })).resolves.toEqual({
      status: "FAILED",
      code: "MATERIAL_PROVIDER_UNAVAILABLE",
    });
    await expect(persistenceFailure.issue({ userId: "admin-1" })).resolves.toEqual({
      status: "FAILED",
      code: "PERSISTENCE_UNAVAILABLE",
    });
  });
});

import { describe, expect, it } from "vitest";
import type { IdentityPrincipal } from "../contracts/identity.contract";
import type { IdentityRepository } from "../logic/identity-repository";
import { createIdentityLookupCapability } from "../logic/identity-service";

const principal: IdentityPrincipal = Object.freeze({
  id: "user-1",
  email: "person@example.com",
  name: "Person",
  emailVerified: new Date("2026-08-30T00:00:00.000Z"),
  role: "CUSTOMER",
  establishedAt: new Date("2026-08-01T00:00:00.000Z"),
  suspendedAt: null,
  lifecycleState: "ACTIVE",
});

function repository(overrides: Partial<IdentityRepository> = {}): IdentityRepository {
  return {
    findById: async () => principal,
    findByEmail: async () => principal,
    findPasswordAuthenticationByEmail: async () => null,
    ...overrides,
  };
}

describe("Identity lookup capability", () => {
  it("returns a principal by id including its canonical establishment time", async () => {
    const identity = createIdentityLookupCapability(repository());
    await expect(identity.findById(" user-1 ")).resolves.toEqual({
      status: "FOUND",
      principal,
    });
  });

  it("returns NOT_FOUND when persistence has no principal", async () => {
    const identity = createIdentityLookupCapability(
      repository({ findById: async () => null }),
    );
    await expect(identity.findById("missing")).resolves.toEqual({ status: "NOT_FOUND" });
  });

  it("rejects blank identifiers without calling persistence", async () => {
    let called = false;
    const identity = createIdentityLookupCapability(
      repository({
        findByEmail: async () => {
          called = true;
          return principal;
        },
      }),
    );
    await expect(identity.findByEmail("   ")).resolves.toEqual({
      status: "FAILED",
      code: "INVALID_IDENTIFIER",
    });
    expect(called).toBe(false);
  });

  it("maps persistence failure to a typed failure", async () => {
    const identity = createIdentityLookupCapability(
      repository({
        findById: async () => {
          throw new Error("database unavailable");
        },
      }),
    );
    await expect(identity.findById("user-1")).resolves.toEqual({
      status: "FAILED",
      code: "PERSISTENCE_UNAVAILABLE",
    });
  });
});

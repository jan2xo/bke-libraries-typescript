import { describe, expect, it, vi } from "vitest";
import { createIdentityGoogleAuthenticationCapability } from "../logic/google-authentication";
import type { IdentityGoogleIdentityRepository } from "../logic/google-identity-repository";
import { identityModuleManifest } from "../module.manifest";
import { IDENTITY_GOOGLE_AUTHENTICATION_CAPABILITY_ID } from "../contracts/google-authentication.contract";
import { IDENTITY_GOOGLE_PRINCIPAL_BINDING_CAPABILITY_ID } from "../contracts/google-identity.contract";

const principal = {
  id: "bke-user-1",
  email: "contact@example.com",
  name: "BKE User",
  emailVerified: null,
  role: "CUSTOMER" as const,
  establishedAt: new Date("2026-01-01T00:00:00Z"),
  suspendedAt: null,
  lifecycleState: "ACTIVE" as const,
};

function repository(
  record: Awaited<ReturnType<IdentityGoogleIdentityRepository["findAuthenticationBySubject"]>>,
): IdentityGoogleIdentityRepository {
  return {
    bindSubject: vi.fn(async () => ({ status: "BOUND" as const })),
    findPrincipalBySubject: vi.fn(async () => record?.principal ?? null),
    findAuthenticationBySubject: vi.fn(async () => record),
  };
}

describe("Google primary authentication", () => {
  it("advertises the Google binding and authentication capabilities in the module manifest", () => {
    expect(identityModuleManifest.provides).toContain(IDENTITY_GOOGLE_PRINCIPAL_BINDING_CAPABILITY_ID);
    expect(identityModuleManifest.provides).toContain(IDENTITY_GOOGLE_AUTHENTICATION_CAPABILITY_ID);
  });


  it("resolves the stable subject to the existing BKE principal and routes enabled MFA", async () => {
    const repo = repository({ principal, mfaEnabled: true });
    const result = await createIdentityGoogleAuthenticationCapability(repo).authenticate({
      subject: "stable-google-subject",
    });
    expect(result).toEqual({
      status: "PRIMARY_AUTHENTICATED",
      principal,
      route: "MFA_CHALLENGE",
    });
    expect(repo.findAuthenticationBySubject).toHaveBeenCalledWith("stable-google-subject");
  });

  it("does not infer MFA from Google login or contact email", async () => {
    const result = await createIdentityGoogleAuthenticationCapability(
      repository({ principal, mfaEnabled: false }),
    ).authenticate({ subject: "stable-google-subject" });
    expect(result).toMatchObject({ status: "PRIMARY_AUTHENTICATED", route: "SESSION" });
  });

  it("requires administrator enrollment when application MFA is not enabled", async () => {
    const result = await createIdentityGoogleAuthenticationCapability(
      repository({ principal: { ...principal, role: "ADMIN" }, mfaEnabled: false }),
    ).authenticate({ subject: "stable-google-subject" });
    expect(result).toMatchObject({ status: "PRIMARY_AUTHENTICATED", route: "MFA_ENROLLMENT" });
  });

  it("rejects unbound subjects and inactive principals", async () => {
    await expect(
      createIdentityGoogleAuthenticationCapability(repository(null)).authenticate({
        subject: "unbound-subject",
      }),
    ).resolves.toEqual({ status: "INVALID_CREDENTIALS" });

    await expect(
      createIdentityGoogleAuthenticationCapability(
        repository({ principal: { ...principal, lifecycleState: "SUSPENDED" }, mfaEnabled: false }),
      ).authenticate({ subject: "inactive-subject" }),
    ).resolves.toEqual({ status: "INVALID_CREDENTIALS" });
  });
});

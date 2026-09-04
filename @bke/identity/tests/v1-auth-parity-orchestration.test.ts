import { describe, expect, it, vi } from "vitest";
import { createIdentityPasswordLoginCapability } from "../logic/password-login";
import { createIdentityPasswordChangeSessionCapability } from "../logic/password-change-session";
import { createIdentitySessionAdministrationCapability } from "../logic/session-administration";
import type { IdentityPrincipal } from "../contracts/identity.contract";
import type { IdentityIssuedSession } from "../contracts/session.contract";

const now = new Date("2026-09-05T02:30:00.000Z");
const principal: IdentityPrincipal = {
  id: "customer-1",
  email: "customer@example.com",
  name: null,
  emailVerified: now,
  role: "CUSTOMER",
  establishedAt: now,
  suspendedAt: null,
  lifecycleState: "ACTIVE",
};
const session: IdentityIssuedSession = {
  id: "session-1",
  userId: principal.id,
  expiresAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
  lastAuthenticatedAt: now,
  mfaVerifiedAt: null,
  recentAuthenticatedAt: now,
  lastSeenAt: now,
  absoluteExpiresAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
  authenticationMethod: "PASSWORD",
  assuranceLevel: "RECENTLY_AUTHENTICATED",
  createdAt: now,
};

describe("Identity V1 auth parity orchestration", () => {
  it("issues a PASSWORD session immediately for a customer password login", async () => {
    const sessionIssue = vi.fn(async () => ({ status: "ISSUED" as const, token: "session-token", session }));
    const capability = createIdentityPasswordLoginCapability(
      { authenticate: vi.fn(async () => ({ status: "PRIMARY_AUTHENTICATED" as const, principal, route: "CUSTOMER_SESSION" as const })) },
      { issue: sessionIssue },
      { issue: vi.fn() },
    );

    await expect(capability.login({ email: principal.email, password: "secret", userAgentSummary: "ua" })).resolves.toMatchObject({
      status: "SESSION_ISSUED",
      token: "session-token",
      mfaEnrollmentRequired: false,
    });
    expect(sessionIssue).toHaveBeenCalledWith({
      userId: principal.id,
      authenticationMethod: "PASSWORD",
      userAgentSummary: "ua",
      networkHint: undefined,
    });
  });

  it("issues a challenge, not a session, when an administrator requires login MFA", async () => {
    const admin = { ...principal, id: "admin-1", email: "admin@example.com", role: "ADMIN" as const };
    const sessionIssue = vi.fn();
    const challengeIssue = vi.fn(async () => ({
      status: "ISSUED" as const,
      challenge: {
        challengeToken: "challenge-token",
        expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
        delivery: { recipientEmail: admin.email, code: "123456", reference: "ABC123" },
      },
    }));
    const capability = createIdentityPasswordLoginCapability(
      { authenticate: vi.fn(async () => ({ status: "PRIMARY_AUTHENTICATED" as const, principal: admin, route: "ADMIN_MFA_CHALLENGE" as const })) },
      { issue: sessionIssue },
      { issue: challengeIssue },
    );

    await expect(capability.login({ email: admin.email, password: "secret" })).resolves.toMatchObject({ status: "MFA_CHALLENGE_ISSUED" });
    expect(challengeIssue).toHaveBeenCalledWith({ userId: admin.id });
    expect(sessionIssue).not.toHaveBeenCalled();
  });

  it("reissues the V1 replacement session after password change and exposes post-change issuance failure", async () => {
    const successful = createIdentityPasswordChangeSessionCapability(
      { change: vi.fn(async () => ({ status: "CHANGED" as const, userId: principal.id, role: "CUSTOMER" as const, replacementAuthenticationMethod: "PASSWORD" as const })) },
      { issue: vi.fn(async () => ({ status: "ISSUED" as const, token: "replacement", session })) },
    );
    await expect(successful.changeAndReissue({ sessionToken: "old", currentPassword: "old", newPassword: "NewPassword123" })).resolves.toMatchObject({
      status: "CHANGED",
      token: "replacement",
    });

    const failedIssue = createIdentityPasswordChangeSessionCapability(
      { change: vi.fn(async () => ({ status: "CHANGED" as const, userId: principal.id, role: "CUSTOMER" as const, replacementAuthenticationMethod: "PASSWORD" as const })) },
      { issue: vi.fn(async () => ({ status: "FAILED" as const, code: "PERSISTENCE_UNAVAILABLE" as const })) },
    );
    await expect(failedIssue.changeAndReissue({ sessionToken: "old", currentPassword: "old", newPassword: "NewPassword123" })).resolves.toEqual({
      status: "CHANGED_SESSION_NOT_ISSUED",
      userId: principal.id,
      code: "PERSISTENCE_UNAVAILABLE",
    });
  });

  it("preserves ONE/OTHERS/ALL administrative session semantics", async () => {
    const revoke = vi.fn(async () => ({ status: "REVOKED" as const, signedOut: false }));
    const capability = createIdentitySessionAdministrationCapability({ revokeAdministratorSessions: revoke }, () => now);
    await expect(capability.revoke({ userId: " admin-1 ", currentSessionId: " current ", action: "OTHERS" })).resolves.toEqual({
      status: "REVOKED",
      action: "OTHERS",
      signedOut: false,
    });
    expect(revoke).toHaveBeenCalledWith({
      userId: "admin-1",
      currentSessionId: "current",
      action: "OTHERS",
      targetSessionId: null,
      revokedAt: now,
    });
    await expect(capability.revoke({ userId: "admin-1", currentSessionId: "current", action: "ONE" })).resolves.toEqual({
      status: "FAILED",
      code: "INVALID_INPUT",
    });
  });
});

import type {
  IdentityFederatedAuthenticationCapability,
  IdentityFederatedAuthenticationResult,
  IdentityVerifiedFederatedAssertion,
} from "../contracts/federated-authentication.contract";
import type { IdentityPrincipal } from "../contracts/identity.contract";
import type { IdentityFederatedAuthenticationRepository } from "./federated-authentication-repository";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function activeCustomer(principal: IdentityPrincipal):
  | { readonly ok: true }
  | { readonly ok: false; readonly code: "ACCOUNT_NOT_ACTIVE" | "ADMIN_FEDERATION_FORBIDDEN" } {
  if (principal.role === "ADMIN") return { ok: false, code: "ADMIN_FEDERATION_FORBIDDEN" };
  if (principal.lifecycleState !== "ACTIVE" || principal.suspendedAt) {
    return { ok: false, code: "ACCOUNT_NOT_ACTIVE" };
  }
  return { ok: true };
}

function normalizeAssertion(
  assertion: IdentityVerifiedFederatedAssertion,
): IdentityVerifiedFederatedAssertion | null {
  const subject = assertion.subject.trim();
  const email = assertion.email.trim().toLowerCase();
  const name = assertion.name?.trim() || null;
  if (
    assertion.provider !== "GOOGLE" ||
    !subject ||
    subject.length > 255 ||
    !email ||
    email.length > 320 ||
    !emailPattern.test(email) ||
    !Number.isFinite(assertion.authenticatedAt.getTime())
  ) return null;
  return Object.freeze({
    provider: assertion.provider,
    subject,
    email,
    emailVerified: assertion.emailVerified,
    name,
    authenticatedAt: assertion.authenticatedAt,
  });
}

export function createIdentityFederatedAuthenticationCapability(
  repository: IdentityFederatedAuthenticationRepository,
): IdentityFederatedAuthenticationCapability {
  return Object.freeze({
    async authenticate(
      assertion: IdentityVerifiedFederatedAssertion,
    ): Promise<IdentityFederatedAuthenticationResult> {
      const normalized = normalizeAssertion(assertion);
      if (!normalized) return { status: "FAILED", code: "INVALID_INPUT" };
      if (!normalized.emailVerified) return { status: "REJECTED", code: "EMAIL_NOT_VERIFIED" };

      try {
        const bound = await repository.findByProviderSubject(
          normalized.provider,
          normalized.subject,
        );
        if (bound) {
          const eligibility = activeCustomer(bound.principal);
          if (!eligibility.ok) return { status: "REJECTED", code: eligibility.code };
          await repository.recordAuthentication({
            provider: normalized.provider,
            subject: normalized.subject,
            email: normalized.email,
            authenticatedAt: normalized.authenticatedAt,
          });
          return {
            status: "AUTHENTICATED",
            principal: bound.principal,
            binding: "EXISTING",
          };
        }

        const emailPrincipal = await repository.findPrincipalByEmail(normalized.email);
        if (!emailPrincipal) {
          return {
            status: "REGISTRATION_REQUIRED",
            profile: Object.freeze({
              provider: normalized.provider,
              subject: normalized.subject,
              email: normalized.email,
              name: normalized.name ?? null,
              authenticatedAt: normalized.authenticatedAt,
            }),
          };
        }

        const eligibility = activeCustomer(emailPrincipal);
        if (!eligibility.ok) return { status: "REJECTED", code: eligibility.code };

        const linked = await repository.linkExistingByVerifiedEmail({
          userId: emailPrincipal.id,
          assertion: normalized,
        });
        if (linked.status === "CONFLICT") {
          return { status: "REJECTED", code: "FEDERATED_IDENTITY_CONFLICT" };
        }

        return {
          status: "AUTHENTICATED",
          principal: linked.principal,
          binding: "LINKED_BY_VERIFIED_EMAIL",
        };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}

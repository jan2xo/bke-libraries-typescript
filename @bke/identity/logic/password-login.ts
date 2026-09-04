import type { IdentityPasswordAuthenticationCapability } from "../contracts/identity.contract";
import type { IdentityLoginMfaChallengeIssuanceCapability } from "../contracts/login-mfa-challenge.contract";
import type {
  IdentityPasswordLoginCapability,
  IdentityPasswordLoginInput,
  IdentityPasswordLoginResult,
} from "../contracts/password-login.contract";
import type { IdentitySessionIssuanceCapability } from "../contracts/session.contract";

export function createIdentityPasswordLoginCapability(
  authentication: IdentityPasswordAuthenticationCapability,
  sessionIssuance: IdentitySessionIssuanceCapability,
  loginMfaChallengeIssuance: IdentityLoginMfaChallengeIssuanceCapability,
): IdentityPasswordLoginCapability {
  return Object.freeze({
    async login(input: IdentityPasswordLoginInput): Promise<IdentityPasswordLoginResult> {
      const authenticated = await authentication.authenticate({
        email: input.email,
        password: input.password,
      });

      if (authenticated.status === "INVALID_CREDENTIALS") {
        return authenticated;
      }
      if (authenticated.status === "FAILED") {
        return authenticated;
      }

      if (authenticated.route === "ADMIN_MFA_CHALLENGE") {
        const issued = await loginMfaChallengeIssuance.issue({
          userId: authenticated.principal.id,
        });
        if (issued.status === "ISSUED") {
          return {
            status: "MFA_CHALLENGE_ISSUED",
            principal: authenticated.principal,
            challenge: issued.challenge,
          };
        }
        return issued;
      }

      const mfaEnrollmentRequired = authenticated.route === "ADMIN_MFA_ENROLLMENT";
      const issued = await sessionIssuance.issue({
        userId: authenticated.principal.id,
        authenticationMethod: mfaEnrollmentRequired ? "MFA_ENROLLMENT" : "PASSWORD",
        userAgentSummary: input.userAgentSummary,
        networkHint: input.networkHint,
      });
      if (issued.status !== "ISSUED") {
        return issued;
      }

      return {
        status: "SESSION_ISSUED",
        principal: authenticated.principal,
        token: issued.token,
        session: issued.session,
        mfaEnrollmentRequired,
      };
    },
  });
}

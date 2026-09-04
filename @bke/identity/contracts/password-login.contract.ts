import type { IdentityPrincipal } from "./identity.contract";
import type { IdentityIssuedLoginMfaChallenge } from "./login-mfa-challenge.contract";
import type { IdentityIssuedSession } from "./session.contract";

export const IDENTITY_PASSWORD_LOGIN_CAPABILITY_ID =
  "bke.identity.password-login.v1" as const;

export interface IdentityPasswordLoginInput {
  readonly email: string;
  readonly password: string;
  readonly userAgentSummary?: string | null;
  readonly networkHint?: string | null;
}

export type IdentityPasswordLoginResult =
  | {
      readonly status: "SESSION_ISSUED";
      readonly principal: IdentityPrincipal;
      readonly token: string;
      readonly session: IdentityIssuedSession;
      readonly mfaEnrollmentRequired: boolean;
    }
  | {
      readonly status: "MFA_CHALLENGE_ISSUED";
      readonly principal: IdentityPrincipal;
      readonly challenge: IdentityIssuedLoginMfaChallenge;
    }
  | { readonly status: "INVALID_CREDENTIALS" }
  | {
      readonly status: "REJECTED";
      readonly code: "PRINCIPAL_NOT_FOUND" | "ACCOUNT_NOT_ACTIVE" | "FORBIDDEN";
    }
  | {
      readonly status: "FAILED";
      readonly code:
        | "INVALID_INPUT"
        | "PERSISTENCE_UNAVAILABLE"
        | "TOKEN_PROVIDER_UNAVAILABLE"
        | "MATERIAL_PROVIDER_UNAVAILABLE";
    };

export interface IdentityPasswordLoginCapability {
  login(input: IdentityPasswordLoginInput): Promise<IdentityPasswordLoginResult>;
}

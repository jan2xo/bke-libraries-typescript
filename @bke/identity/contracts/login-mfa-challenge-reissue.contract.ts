import type { IdentityIssuedLoginMfaChallenge } from "./login-mfa-challenge.contract";

export const IDENTITY_LOGIN_MFA_CHALLENGE_REISSUE_CAPABILITY_ID =
  "bke.identity.login-mfa-challenge-reissue.v1" as const;

export interface IdentityLoginMfaChallengeReissueInput {
  readonly challengeToken: string;
}

export type IdentityLoginMfaChallengeReissueResult =
  | {
      readonly status: "ISSUED";
      readonly challenge: IdentityIssuedLoginMfaChallenge;
    }
  | {
      readonly status: "REJECTED";
      readonly code: "INVALID_MFA_CHALLENGE" | "PRINCIPAL_NOT_FOUND" | "FORBIDDEN";
    }
  | {
      readonly status: "FAILED";
      readonly code:
        | "INVALID_INPUT"
        | "PROOF_PROVIDER_UNAVAILABLE"
        | "PERSISTENCE_UNAVAILABLE"
        | "MATERIAL_PROVIDER_UNAVAILABLE";
    };

export interface IdentityLoginMfaChallengeReissueCapability {
  reissue(
    input: IdentityLoginMfaChallengeReissueInput,
  ): Promise<IdentityLoginMfaChallengeReissueResult>;
}

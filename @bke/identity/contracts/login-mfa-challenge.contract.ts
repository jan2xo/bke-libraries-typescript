export const IDENTITY_LOGIN_MFA_CHALLENGE_ISSUANCE_CAPABILITY_ID =
  "bke.identity.login-mfa-challenge-issuance.v1" as const;

export interface IdentityLoginMfaChallengeIssueInput {
  readonly userId: string;
}

export interface IdentityLoginMfaChallengeDelivery {
  readonly recipientEmail: string;
  readonly code: string;
  readonly reference: string;
}

export interface IdentityIssuedLoginMfaChallenge {
  readonly challengeToken: string;
  readonly expiresAt: Date;
  readonly delivery: IdentityLoginMfaChallengeDelivery;
}

export type IdentityLoginMfaChallengeIssueResult =
  | {
      readonly status: "ISSUED";
      readonly challenge: IdentityIssuedLoginMfaChallenge;
    }
  | {
      readonly status: "REJECTED";
      readonly code: "PRINCIPAL_NOT_FOUND" | "FORBIDDEN";
    }
  | {
      readonly status: "FAILED";
      readonly code:
        | "INVALID_INPUT"
        | "MATERIAL_PROVIDER_UNAVAILABLE"
        | "PERSISTENCE_UNAVAILABLE";
    };

export interface IdentityLoginMfaChallengeIssuanceCapability {
  issue(
    input: IdentityLoginMfaChallengeIssueInput,
  ): Promise<IdentityLoginMfaChallengeIssueResult>;
}

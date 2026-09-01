export const IDENTITY_RECENT_AUTH_CHALLENGE_ISSUANCE_CAPABILITY_ID =
  "bke.identity.recent-auth-challenge-issuance.v1" as const;

export interface IdentityRecentAuthChallengeIssueInput {
  readonly userId: string;
}

export interface IdentityRecentAuthChallengeDelivery {
  readonly recipientEmail: string;
  readonly code: string;
  readonly reference: string;
}

export interface IdentityIssuedRecentAuthChallenge {
  readonly challengeToken: string;
  readonly expiresAt: Date;
  readonly delivery: IdentityRecentAuthChallengeDelivery;
}

export type IdentityRecentAuthChallengeIssueResult =
  | {
      readonly status: "ISSUED";
      readonly challenge: IdentityIssuedRecentAuthChallenge;
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

export interface IdentityRecentAuthChallengeIssuanceCapability {
  issue(
    input: IdentityRecentAuthChallengeIssueInput,
  ): Promise<IdentityRecentAuthChallengeIssueResult>;
}

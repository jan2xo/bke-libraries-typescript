export const IDENTITY_SESSION_ISSUANCE_CAPABILITY_ID =
  "bke.identity.session-issuance.v1" as const;

export type IdentitySessionAuthenticationMethod =
  | "PASSWORD"
  | "PASSWORD_TOTP"
  | "PASSWORD_EMAIL_OTP"
  | "PASSWORD_RECOVERY"
  | "MAGIC_LINK"
  | "MFA_ENROLLMENT";

export type IdentitySessionAssuranceLevel =
  | "BASIC"
  | "MFA_VERIFIED"
  | "RECENTLY_AUTHENTICATED";

export interface IdentitySessionIssueInput {
  readonly userId: string;
  readonly authenticationMethod: IdentitySessionAuthenticationMethod;
  readonly userAgentSummary?: string | null;
  readonly networkHint?: string | null;
}

export interface IdentityIssuedSession {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly lastAuthenticatedAt: Date;
  readonly mfaVerifiedAt: Date | null;
  readonly recentAuthenticatedAt: Date | null;
  readonly lastSeenAt: Date;
  readonly absoluteExpiresAt: Date;
  readonly authenticationMethod: IdentitySessionAuthenticationMethod;
  readonly assuranceLevel: IdentitySessionAssuranceLevel;
  readonly createdAt: Date;
}

export type IdentitySessionIssueRejectionCode =
  | "PRINCIPAL_NOT_FOUND"
  | "ACCOUNT_NOT_ACTIVE";

export type IdentitySessionIssueFailureCode =
  | "INVALID_INPUT"
  | "TOKEN_PROVIDER_UNAVAILABLE"
  | "PERSISTENCE_UNAVAILABLE";

export type IdentitySessionIssueResult =
  | {
      readonly status: "ISSUED";
      readonly token: string;
      readonly session: IdentityIssuedSession;
    }
  | {
      readonly status: "REJECTED";
      readonly code: IdentitySessionIssueRejectionCode;
    }
  | {
      readonly status: "FAILED";
      readonly code: IdentitySessionIssueFailureCode;
    };

export interface IdentitySessionIssuanceCapability {
  issue(input: IdentitySessionIssueInput): Promise<IdentitySessionIssueResult>;
}

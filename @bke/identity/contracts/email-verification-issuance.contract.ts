export const IDENTITY_EMAIL_VERIFICATION_ISSUANCE_CAPABILITY_ID =
  "bke.identity.email-verification-issuance.v1" as const;

export interface IdentityEmailVerificationIssuanceInput {
  readonly userId: string;
}

export interface IdentityEmailVerificationDelivery {
  readonly recipientEmail: string;
  readonly token: string;
}

export type IdentityEmailVerificationIssuanceResult =
  | {
      readonly status: "ISSUED";
      readonly userId: string;
      readonly delivery: IdentityEmailVerificationDelivery;
    }
  | {
      readonly status: "ALREADY_VERIFIED";
      readonly userId: string;
      readonly email: string;
    }
  | {
      readonly status: "REJECTED";
      readonly code: "PRINCIPAL_NOT_FOUND";
    }
  | {
      readonly status: "FAILED";
      readonly code:
        | "INVALID_INPUT"
        | "TOKEN_PROVIDER_UNAVAILABLE"
        | "PERSISTENCE_UNAVAILABLE";
    };

export interface IdentityEmailVerificationIssuanceCapability {
  issue(
    input: IdentityEmailVerificationIssuanceInput,
  ): Promise<IdentityEmailVerificationIssuanceResult>;
}

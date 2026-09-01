export const IDENTITY_EMAIL_VERIFICATION_COMPLETION_CAPABILITY_ID =
  "bke.identity.email-verification-completion.v1" as const;

export interface IdentityEmailVerificationCompletionInput {
  readonly token: string;
}

export type IdentityEmailVerificationCompletionResult =
  | {
      readonly status: "VERIFIED";
      readonly userId: string;
      readonly email: string;
      readonly verifiedAt: Date;
    }
  | {
      readonly status: "REJECTED";
      readonly code: "INVALID_TOKEN";
    }
  | {
      readonly status: "FAILED";
      readonly code: "TOKEN_PROVIDER_UNAVAILABLE" | "PERSISTENCE_UNAVAILABLE";
    };

export interface IdentityEmailVerificationCompletionCapability {
  complete(
    input: IdentityEmailVerificationCompletionInput,
  ): Promise<IdentityEmailVerificationCompletionResult>;
}

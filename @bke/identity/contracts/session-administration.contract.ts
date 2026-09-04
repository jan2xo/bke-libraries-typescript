export const IDENTITY_SESSION_ADMINISTRATION_CAPABILITY_ID =
  "bke.identity.session-administration.v1" as const;

export type IdentitySessionRevocationAction = "ONE" | "OTHERS" | "ALL";

export interface IdentitySessionAdministrationInput {
  readonly userId: string;
  readonly currentSessionId: string;
  readonly action: IdentitySessionRevocationAction;
  readonly targetSessionId?: string;
}

export type IdentitySessionAdministrationResult =
  | {
      readonly status: "REVOKED";
      readonly action: IdentitySessionRevocationAction;
      readonly signedOut: boolean;
    }
  | {
      readonly status: "REJECTED";
      readonly code: "PRINCIPAL_NOT_FOUND" | "FORBIDDEN" | "SESSION_NOT_FOUND" | "SESSION_NOT_OWNED";
    }
  | {
      readonly status: "FAILED";
      readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE";
    };

export interface IdentitySessionAdministrationCapability {
  revoke(
    input: IdentitySessionAdministrationInput,
  ): Promise<IdentitySessionAdministrationResult>;
}

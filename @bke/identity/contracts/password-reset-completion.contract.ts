import type { IdentityRole } from "./identity.contract";

export const IDENTITY_PASSWORD_RESET_COMPLETION_CAPABILITY_ID =
  "bke.identity.password-reset-completion.v1" as const;

export interface IdentityPasswordResetCompletionInput {
  readonly token: string;
  readonly password: string;
}

export type IdentityPasswordResetCompletionResult =
  | {
      readonly status: "COMPLETED";
      readonly userId: string;
      readonly role: IdentityRole;
    }
  | {
      readonly status: "INVALID";
      readonly code: "INVALID_TOKEN";
    }
  | {
      readonly status: "FAILED";
      readonly code:
        | "INVALID_INPUT"
        | "TOKEN_PROVIDER_UNAVAILABLE"
        | "PASSWORD_PROVIDER_UNAVAILABLE"
        | "PERSISTENCE_UNAVAILABLE";
    };

export interface IdentityPasswordResetCompletionCapability {
  complete(
    input: IdentityPasswordResetCompletionInput,
  ): Promise<IdentityPasswordResetCompletionResult>;
}

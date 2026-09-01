export const IDENTITY_SESSION_TERMINATION_CAPABILITY_ID =
  "bke.identity.session-termination.v1" as const;

export type IdentitySessionTerminationFailureCode =
  | "TOKEN_PROVIDER_UNAVAILABLE"
  | "PERSISTENCE_UNAVAILABLE";

export type IdentitySessionTerminationResult =
  | { readonly status: "TERMINATED" }
  | { readonly status: "NO_SESSION" }
  | {
      readonly status: "FAILED";
      readonly code: IdentitySessionTerminationFailureCode;
    };

export interface IdentitySessionTerminationCapability {
  terminate(token: string): Promise<IdentitySessionTerminationResult>;
}

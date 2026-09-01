import type { IdentityPrincipal } from "./identity.contract";
import type { IdentityIssuedSession } from "./session.contract";

export const IDENTITY_SESSION_VALIDATION_CAPABILITY_ID =
  "bke.identity.session-validation.v1" as const;

export type IdentitySessionInvalidCode =
  | "TOKEN_MISSING"
  | "SESSION_NOT_FOUND"
  | "SESSION_REVOKED"
  | "ACCOUNT_SUSPENDED"
  | "EXPIRED"
  | "IDLE_TIMEOUT";

export type IdentitySessionValidationFailureCode =
  | "TOKEN_PROVIDER_UNAVAILABLE"
  | "PERSISTENCE_UNAVAILABLE";

export interface IdentitySessionContext {
  readonly session: IdentityIssuedSession;
  readonly principal: IdentityPrincipal;
  readonly administratorMfaEnabled: boolean;
}

export type IdentitySessionValidationResult =
  | { readonly status: "VALID"; readonly context: IdentitySessionContext }
  | { readonly status: "INVALID"; readonly code: IdentitySessionInvalidCode }
  | {
      readonly status: "FAILED";
      readonly code: IdentitySessionValidationFailureCode;
    };

export interface IdentitySessionValidationCapability {
  validate(token: string): Promise<IdentitySessionValidationResult>;
}

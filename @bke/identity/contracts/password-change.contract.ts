import type { IdentityRole } from "./identity.contract";
import type { IdentitySessionAuthenticationMethod } from "./session.contract";

export const IDENTITY_PASSWORD_CHANGE_CAPABILITY_ID =
  "bke.identity.password-change.v1" as const;

export interface IdentityPasswordChangeInput {
  readonly sessionToken: string;
  readonly currentPassword: string;
  readonly newPassword: string;
}

export type IdentityPasswordChangeInvalidCode =
  | "INVALID_SESSION"
  | "RECENT_AUTH_REQUIRED"
  | "INVALID_CREDENTIALS";

export type IdentityPasswordChangeFailureCode =
  | "INVALID_INPUT"
  | "SESSION_PROVIDER_UNAVAILABLE"
  | "PASSWORD_PROVIDER_UNAVAILABLE"
  | "PERSISTENCE_UNAVAILABLE";

export type IdentityPasswordChangeResult =
  | {
      readonly status: "CHANGED";
      readonly userId: string;
      readonly role: IdentityRole;
      readonly replacementAuthenticationMethod: IdentitySessionAuthenticationMethod;
    }
  | {
      readonly status: "INVALID";
      readonly code: IdentityPasswordChangeInvalidCode;
    }
  | {
      readonly status: "FAILED";
      readonly code: IdentityPasswordChangeFailureCode;
    };

export interface IdentityPasswordChangeCapability {
  change(input: IdentityPasswordChangeInput): Promise<IdentityPasswordChangeResult>;
}

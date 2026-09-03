export const IDENTITY_LOOKUP_CAPABILITY_ID = "bke.identity.lookup.v1" as const;
export const IDENTITY_PASSWORD_AUTHENTICATION_CAPABILITY_ID =
  "bke.identity.password-authentication.v1" as const;

export type IdentityRole = "CUSTOMER" | "ADMIN";

export type IdentityLifecycleState =
  | "ACTIVE"
  | "SUSPENDED"
  | "CLOSURE_REQUESTED"
  | "CLOSED"
  | "PRIVACY_REVIEW"
  | "PSEUDONYMIZED"
  | "PURGE_ELIGIBLE";

export interface IdentityPrincipal {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly emailVerified: Date | null;
  readonly role: IdentityRole;
  readonly establishedAt: Date;
  readonly suspendedAt: Date | null;
  readonly lifecycleState: IdentityLifecycleState;
}

export type IdentityLookupFailureCode =
  | "INVALID_IDENTIFIER"
  | "PERSISTENCE_UNAVAILABLE";

export type IdentityLookupResult =
  | { readonly status: "FOUND"; readonly principal: IdentityPrincipal }
  | { readonly status: "NOT_FOUND" }
  | { readonly status: "FAILED"; readonly code: IdentityLookupFailureCode };

export interface IdentityLookupCapability {
  findById(userId: string): Promise<IdentityLookupResult>;
  findByEmail(email: string): Promise<IdentityLookupResult>;
}

export interface IdentityPasswordAuthenticationInput {
  readonly email: string;
  readonly password: string;
}

export type IdentityPrimaryAuthenticationRoute =
  | "CUSTOMER_SESSION"
  | "ADMIN_MFA_CHALLENGE"
  | "ADMIN_MFA_ENROLLMENT";

export type IdentityPasswordAuthenticationFailureCode =
  | "INVALID_INPUT"
  | "PERSISTENCE_UNAVAILABLE";

export type IdentityPasswordAuthenticationResult =
  | {
      readonly status: "PRIMARY_AUTHENTICATED";
      readonly principal: IdentityPrincipal;
      readonly route: IdentityPrimaryAuthenticationRoute;
    }
  | { readonly status: "INVALID_CREDENTIALS" }
  | {
      readonly status: "FAILED";
      readonly code: IdentityPasswordAuthenticationFailureCode;
    };

export interface IdentityPasswordAuthenticationCapability {
  authenticate(
    input: IdentityPasswordAuthenticationInput,
  ): Promise<IdentityPasswordAuthenticationResult>;
}

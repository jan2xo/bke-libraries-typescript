import type { IdentityPrincipal, IdentityPrimaryAuthenticationRoute } from "./identity.contract";

export const IDENTITY_GOOGLE_AUTHENTICATION_CAPABILITY_ID =
  "bke.identity.google-authentication.v1" as const;

/** Call only with a stable subject from a fully validated Google OIDC response. */
export interface IdentityGoogleAuthenticationCapability {
  authenticate(input: Readonly<{ subject: string }>): Promise<IdentityGoogleAuthenticationResult>;
}

export type IdentityGoogleAuthenticationResult =
  | {
      readonly status: "PRIMARY_AUTHENTICATED";
      readonly principal: IdentityPrincipal;
      readonly route: IdentityPrimaryAuthenticationRoute;
    }
  | { readonly status: "INVALID_CREDENTIALS" }
  | {
      readonly status: "FAILED";
      readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE";
    };

import type { IdentityPrincipal } from "./identity.contract";

export const IDENTITY_FEDERATED_AUTHENTICATION_CAPABILITY_ID =
  "bke.identity.federated-authentication.v1" as const;

export type IdentityFederatedProvider = "GOOGLE";

export interface IdentityVerifiedFederatedAssertion {
  readonly provider: IdentityFederatedProvider;
  readonly subject: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly name?: string | null;
  readonly authenticatedAt: Date;
}

export type IdentityFederatedAuthenticationResult =
  | {
      readonly status: "AUTHENTICATED";
      readonly principal: IdentityPrincipal;
      readonly binding: "EXISTING" | "LINKED_BY_VERIFIED_EMAIL";
    }
  | {
      readonly status: "REGISTRATION_REQUIRED";
      readonly profile: Readonly<{
        provider: IdentityFederatedProvider;
        subject: string;
        email: string;
        name: string | null;
        authenticatedAt: Date;
      }>;
    }
  | {
      readonly status: "REJECTED";
      readonly code:
        | "EMAIL_NOT_VERIFIED"
        | "ACCOUNT_NOT_ACTIVE"
        | "ADMIN_FEDERATION_FORBIDDEN"
        | "EMAIL_LINK_REQUIRES_VERIFICATION"
        | "FEDERATED_IDENTITY_CONFLICT";
    }
  | {
      readonly status: "FAILED";
      readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE";
    };

export interface IdentityFederatedAuthenticationCapability {
  authenticate(
    assertion: IdentityVerifiedFederatedAssertion,
  ): Promise<IdentityFederatedAuthenticationResult>;
}

export const IDENTITY_MAGIC_LOGIN_REQUEST_CAPABILITY_ID =
  "bke.identity.magic-login-request.v1" as const;

export interface IdentityMagicLoginRequestInput {
  readonly email: string;
}

export interface IdentityMagicLoginDelivery {
  readonly recipientEmail: string;
  readonly token: string;
}

export type IdentityMagicLoginRequestResult =
  | {
      readonly status: "ACCEPTED";
      readonly delivery: IdentityMagicLoginDelivery | null;
    }
  | {
      readonly status: "FAILED";
      readonly code: "INVALID_INPUT" | "TOKEN_PROVIDER_UNAVAILABLE" | "PERSISTENCE_UNAVAILABLE";
    };

export interface IdentityMagicLoginRequestCapability {
  request(input: IdentityMagicLoginRequestInput): Promise<IdentityMagicLoginRequestResult>;
}

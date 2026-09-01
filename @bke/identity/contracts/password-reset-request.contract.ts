export const IDENTITY_PASSWORD_RESET_REQUEST_CAPABILITY_ID =
  "bke.identity.password-reset-request.v1" as const;

export interface IdentityPasswordResetRequestInput {
  readonly email: string;
}

export interface IdentityPasswordResetDelivery {
  readonly recipientEmail: string;
  readonly token: string;
}

export type IdentityPasswordResetRequestResult =
  | {
      readonly status: "ACCEPTED";
      readonly delivery: IdentityPasswordResetDelivery | null;
    }
  | {
      readonly status: "FAILED";
      readonly code: "INVALID_INPUT" | "TOKEN_PROVIDER_UNAVAILABLE" | "PERSISTENCE_UNAVAILABLE";
    };

export interface IdentityPasswordResetRequestCapability {
  request(
    input: IdentityPasswordResetRequestInput,
  ): Promise<IdentityPasswordResetRequestResult>;
}

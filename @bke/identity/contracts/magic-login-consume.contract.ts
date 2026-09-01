import type { IdentityIssuedSession } from "./session.contract";

export const IDENTITY_MAGIC_LOGIN_CONSUME_CAPABILITY_ID =
  "bke.identity.magic-login-consume.v1" as const;

export interface IdentityMagicLoginConsumeInput {
  readonly token: string;
  readonly userAgentSummary?: string | null;
  readonly networkHint?: string | null;
}

export type IdentityMagicLoginConsumeResult =
  | {
      readonly status: "AUTHENTICATED";
      readonly userId: string;
      readonly role: "CUSTOMER";
      readonly token: string;
      readonly session: IdentityIssuedSession;
    }
  | {
      readonly status: "REJECTED";
      readonly code: "INVALID_TOKEN" | "ADMIN_PASSWORD_REQUIRED" | "ACCOUNT_NOT_ACTIVE";
      readonly userId?: string;
    }
  | {
      readonly status: "FAILED";
      readonly code: "TOKEN_PROVIDER_UNAVAILABLE" | "PERSISTENCE_UNAVAILABLE";
    };

export interface IdentityMagicLoginConsumeCapability {
  consume(input: IdentityMagicLoginConsumeInput): Promise<IdentityMagicLoginConsumeResult>;
}

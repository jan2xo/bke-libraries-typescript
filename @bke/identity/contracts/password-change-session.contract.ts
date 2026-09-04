import type { IdentityPasswordChangeInput, IdentityPasswordChangeResult } from "./password-change.contract";
import type { IdentityIssuedSession } from "./session.contract";

export const IDENTITY_PASSWORD_CHANGE_SESSION_CAPABILITY_ID =
  "bke.identity.password-change-session.v1" as const;

export interface IdentityPasswordChangeSessionInput extends IdentityPasswordChangeInput {
  readonly userAgentSummary?: string | null;
  readonly networkHint?: string | null;
}

export type IdentityPasswordChangeSessionResult =
  | {
      readonly status: "CHANGED";
      readonly userId: string;
      readonly token: string;
      readonly session: IdentityIssuedSession;
    }
  | {
      readonly status: "CHANGED_SESSION_NOT_ISSUED";
      readonly userId: string;
      readonly code: "PRINCIPAL_NOT_FOUND" | "ACCOUNT_NOT_ACTIVE" | "TOKEN_PROVIDER_UNAVAILABLE" | "PERSISTENCE_UNAVAILABLE" | "INVALID_INPUT";
    }
  | Exclude<IdentityPasswordChangeResult, { readonly status: "CHANGED" }>;

export interface IdentityPasswordChangeSessionCapability {
  changeAndReissue(
    input: IdentityPasswordChangeSessionInput,
  ): Promise<IdentityPasswordChangeSessionResult>;
}

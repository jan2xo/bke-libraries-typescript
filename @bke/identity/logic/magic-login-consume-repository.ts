import type { IdentityIssuedSession } from "../contracts/session.contract";

export interface IdentityMagicLoginSessionRecord {
  readonly id: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly authenticatedAt: Date;
  readonly userAgentSummary: string | null;
  readonly networkHint: string | null;
}

export type IdentityMagicLoginConsumePersistenceResult =
  | {
      readonly status: "AUTHENTICATED";
      readonly userId: string;
      readonly session: IdentityIssuedSession;
    }
  | { readonly status: "INVALID_TOKEN" }
  | { readonly status: "ADMIN_PASSWORD_REQUIRED"; readonly userId: string }
  | { readonly status: "ACCOUNT_NOT_ACTIVE"; readonly userId: string };

export interface IdentityMagicLoginConsumeRepository {
  consumeAndIssueSession(
    magicTokenHash: string,
    consumedAt: Date,
    session: IdentityMagicLoginSessionRecord,
  ): Promise<IdentityMagicLoginConsumePersistenceResult>;
}

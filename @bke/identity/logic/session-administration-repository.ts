import type { IdentitySessionRevocationAction } from "../contracts/session-administration.contract";

export interface IdentitySessionAdministrationPersistenceInput {
  readonly userId: string;
  readonly currentSessionId: string;
  readonly action: IdentitySessionRevocationAction;
  readonly targetSessionId: string | null;
  readonly revokedAt: Date;
}

export type IdentitySessionAdministrationPersistenceResult =
  | { readonly status: "REVOKED"; readonly signedOut: boolean }
  | { readonly status: "PRINCIPAL_NOT_FOUND" }
  | { readonly status: "FORBIDDEN" }
  | { readonly status: "SESSION_NOT_FOUND" }
  | { readonly status: "SESSION_NOT_OWNED" };

export interface IdentitySessionAdministrationRepository {
  revokeAdministratorSessions(
    input: IdentitySessionAdministrationPersistenceInput,
  ): Promise<IdentitySessionAdministrationPersistenceResult>;
}

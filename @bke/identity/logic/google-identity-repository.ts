import type { IdentityPrincipal } from "../contracts/identity.contract";

/**
 * Implement this port against the host's active transaction for atomic
 * registration. The standalone PostgreSQL adapter manages its own transaction.
 */
export type IdentityGoogleSubjectBindPersistenceResult =
  | { readonly status: "BOUND" | "ALREADY_BOUND" | "PRINCIPAL_NOT_FOUND" | "ACCOUNT_NOT_ACTIVE" | "SUBJECT_ALREADY_BOUND" | "USER_ALREADY_BOUND" };

export interface IdentityGoogleAuthenticationRecord {
  readonly principal: IdentityPrincipal;
  readonly mfaEnabled: boolean;
}

export interface IdentityGoogleIdentityRepository {
  bindSubject(userId: string, subject: string): Promise<IdentityGoogleSubjectBindPersistenceResult>;
  findPrincipalBySubject(subject: string): Promise<IdentityPrincipal | null>;
  findAuthenticationBySubject(subject: string): Promise<IdentityGoogleAuthenticationRecord | null>;
}

export type IdentityMfaDisableCommitResult =
  | { readonly status: "DISABLED"; readonly enrollmentRequired: boolean }
  | { readonly status: "NOT_FOUND" }
  | { readonly status: "FORBIDDEN" }
  | { readonly status: "MFA_NOT_ENABLED" };

export interface IdentityMfaDisableRepository {
  disableMfa(userId: string, disabledAt: Date): Promise<IdentityMfaDisableCommitResult>;
}

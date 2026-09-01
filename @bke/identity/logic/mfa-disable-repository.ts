export type IdentityMfaDisableCommitResult =
  | "DISABLED"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "MFA_NOT_ENABLED";

export interface IdentityMfaDisableRepository {
  disableMfa(userId: string, disabledAt: Date): Promise<IdentityMfaDisableCommitResult>;
}

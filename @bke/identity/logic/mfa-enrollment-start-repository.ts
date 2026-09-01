export interface IdentityMfaEnrollmentStartPersistenceInput {
  readonly userId: string;
  readonly challengeId: string;
  readonly tokenHash: string;
  readonly codeHash: string;
  readonly pendingExpiresAt: Date;
  readonly updatedAt: Date;
}

export type IdentityMfaEnrollmentStartPersistenceResult =
  | { readonly status: "STARTED"; readonly recipientEmail: string }
  | { readonly status: "PRINCIPAL_NOT_FOUND" }
  | { readonly status: "FORBIDDEN" }
  | { readonly status: "MFA_ALREADY_ENABLED" };

export interface IdentityMfaEnrollmentStartRepository {
  startEnrollment(
    input: IdentityMfaEnrollmentStartPersistenceInput,
  ): Promise<IdentityMfaEnrollmentStartPersistenceResult>;
}

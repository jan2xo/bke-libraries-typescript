import type { IdentitySessionTokenMaterial } from "./session-token-provider";

export interface IdentityMfaEmergencyEnrollmentCommitInput {
  readonly userId: string;
  readonly emergencyTokenHash: string;
  readonly recoveryCodeHashes: readonly string[];
  readonly replacementSession: IdentitySessionTokenMaterial;
  readonly enrolledAt: Date;
  readonly replacementSessionExpiresAt: Date;
}

export type IdentityMfaEmergencyEnrollmentCommitResult =
  | {
      readonly status: "ENROLLED";
      readonly authorizationId: string;
      readonly ownerKeyVersion: number;
      readonly deploymentEnvironment: string;
    }
  | { readonly status: "INVALID_AUTHORIZATION" };

export interface IdentityMfaEmergencyEnrollmentRepository {
  enroll(
    input: IdentityMfaEmergencyEnrollmentCommitInput,
  ): Promise<IdentityMfaEmergencyEnrollmentCommitResult>;
}

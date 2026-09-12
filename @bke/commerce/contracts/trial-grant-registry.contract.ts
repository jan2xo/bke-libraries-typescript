export const COMMERCE_TRIAL_GRANT_REGISTRY_CAPABILITY_ID =
  "bke.commerce.trial-grant-registry.v1" as const;

export const COMMERCE_TRIAL_SOURCES = ["SELF_SERVICE", "ADMIN"] as const;
export type CommerceTrialSource = (typeof COMMERCE_TRIAL_SOURCES)[number];

export interface CommerceTrialGrantSnapshot {
  readonly id: string;
  readonly accountId: string;
  readonly productId: string;
  readonly editionId: string;
  readonly licenseId: string;
  readonly source: CommerceTrialSource;
  readonly selfServiceYear: number | null;
  readonly trialStartsAt: Date;
  readonly trialEndsAt: Date;
  readonly graceEndsAt: Date;
  readonly revokedAt: Date | null;
  readonly createdById: string | null;
  readonly createdAt: Date;
}

export interface CommerceTrialGrantEligibilityInput {
  readonly accountId: string;
  readonly productId: string;
  readonly year: number;
}

export type CommerceTrialGrantEligibilityResult =
  | { readonly status: "AVAILABLE" }
  | { readonly status: "ALREADY_USED" }
  | { readonly status: "FAILED"; readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE" };

export interface CommerceRecordTrialGrantInput {
  readonly accountId: string;
  readonly productId: string;
  readonly editionId: string;
  readonly licenseId: string;
  readonly source: CommerceTrialSource;
  readonly selfServiceYear?: number | null;
  readonly trialStartsAt: Date;
  readonly trialEndsAt: Date;
  readonly graceEndsAt: Date;
  readonly createdById?: string | null;
}

export type CommerceTrialGrantMutationResult =
  | { readonly status: "OK"; readonly value: CommerceTrialGrantSnapshot }
  | { readonly status: "NOT_FOUND" }
  | { readonly status: "ALREADY_USED" }
  | { readonly status: "FAILED"; readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE" };

export interface CommerceTrialGrantRegistryCapability {
  checkSelfServiceEligibility(
    input: CommerceTrialGrantEligibilityInput,
  ): Promise<CommerceTrialGrantEligibilityResult>;
  record(input: CommerceRecordTrialGrantInput): Promise<CommerceTrialGrantMutationResult>;
  findById(trialId: string): Promise<CommerceTrialGrantMutationResult>;
  setGrace(input: {
    readonly trialId: string;
    readonly graceEndsAt: Date;
  }): Promise<CommerceTrialGrantMutationResult>;
  revoke(input: {
    readonly trialId: string;
    readonly revokedAt: Date;
  }): Promise<CommerceTrialGrantMutationResult>;
}

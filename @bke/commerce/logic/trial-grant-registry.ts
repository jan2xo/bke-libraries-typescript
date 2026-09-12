import type {
  CommerceRecordTrialGrantInput,
  CommerceTrialGrantEligibilityInput,
  CommerceTrialGrantEligibilityResult,
  CommerceTrialGrantMutationResult,
  CommerceTrialGrantRegistryCapability,
  CommerceTrialGrantSnapshot,
} from "../contracts/trial-grant-registry.contract";

export interface CommerceTrialGrantRegistryRepository {
  findSelfServiceGrant(input: {
    readonly accountId: string;
    readonly productId: string;
    readonly year: number;
  }): Promise<CommerceTrialGrantSnapshot | null>;
  create(input: CommerceRecordTrialGrantInput): Promise<CommerceTrialGrantSnapshot>;
  findById(trialId: string): Promise<CommerceTrialGrantSnapshot | null>;
  setGrace(input: {
    readonly trialId: string;
    readonly graceEndsAt: Date;
  }): Promise<CommerceTrialGrantSnapshot | null>;
  revoke(input: {
    readonly trialId: string;
    readonly revokedAt: Date;
  }): Promise<CommerceTrialGrantSnapshot | null>;
}

function present(value: string) {
  return value.trim().length > 0;
}

function validYear(value: number) {
  return Number.isInteger(value) && value >= 2000 && value <= 9999;
}

function validDate(value: Date) {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function validRecordInput(input: CommerceRecordTrialGrantInput) {
  if (
    !present(input.accountId) ||
    !present(input.productId) ||
    !present(input.editionId) ||
    !present(input.licenseId)
  ) return false;
  if (input.createdById !== undefined && input.createdById !== null && !present(input.createdById)) return false;
  if (!validDate(input.trialStartsAt) || !validDate(input.trialEndsAt) || !validDate(input.graceEndsAt)) return false;
  if (!(input.trialStartsAt < input.trialEndsAt) || input.graceEndsAt < input.trialEndsAt) return false;
  if (input.source === "SELF_SERVICE") return validYear(input.selfServiceYear ?? Number.NaN);
  return input.selfServiceYear === undefined || input.selfServiceYear === null;
}

function uniqueViolation(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      String((error as { code?: unknown }).code) === "23505",
  );
}

export function createCommerceTrialGrantRegistryCapability(
  repository: CommerceTrialGrantRegistryRepository,
): CommerceTrialGrantRegistryCapability {
  return Object.freeze({
    async checkSelfServiceEligibility(
      input: CommerceTrialGrantEligibilityInput,
    ): Promise<CommerceTrialGrantEligibilityResult> {
      if (!present(input.accountId) || !present(input.productId) || !validYear(input.year)) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }
      try {
        const existing = await repository.findSelfServiceGrant({
          accountId: input.accountId.trim(),
          productId: input.productId.trim(),
          year: input.year,
        });
        return existing ? { status: "ALREADY_USED" } : { status: "AVAILABLE" };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },

    async record(input: CommerceRecordTrialGrantInput): Promise<CommerceTrialGrantMutationResult> {
      if (!validRecordInput(input)) return { status: "FAILED", code: "INVALID_INPUT" };
      try {
        const value = await repository.create({
          ...input,
          accountId: input.accountId.trim(),
          productId: input.productId.trim(),
          editionId: input.editionId.trim(),
          licenseId: input.licenseId.trim(),
          createdById: input.createdById?.trim() || null,
          selfServiceYear: input.source === "SELF_SERVICE" ? input.selfServiceYear! : null,
        });
        return { status: "OK", value };
      } catch (error) {
        if (input.source === "SELF_SERVICE" && uniqueViolation(error)) return { status: "ALREADY_USED" };
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },

    async findById(trialId: string): Promise<CommerceTrialGrantMutationResult> {
      if (!present(trialId)) return { status: "FAILED", code: "INVALID_INPUT" };
      try {
        const value = await repository.findById(trialId.trim());
        return value ? { status: "OK", value } : { status: "NOT_FOUND" };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },

    async setGrace(input: { readonly trialId: string; readonly graceEndsAt: Date }): Promise<CommerceTrialGrantMutationResult> {
      if (!present(input.trialId) || !validDate(input.graceEndsAt)) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }
      try {
        const value = await repository.setGrace({ trialId: input.trialId.trim(), graceEndsAt: input.graceEndsAt });
        return value ? { status: "OK", value } : { status: "NOT_FOUND" };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },

    async revoke(input: { readonly trialId: string; readonly revokedAt: Date }): Promise<CommerceTrialGrantMutationResult> {
      if (!present(input.trialId) || !validDate(input.revokedAt)) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }
      try {
        const value = await repository.revoke({ trialId: input.trialId.trim(), revokedAt: input.revokedAt });
        return value ? { status: "OK", value } : { status: "NOT_FOUND" };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}

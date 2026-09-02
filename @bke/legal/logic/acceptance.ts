import type {
  LegalAcceptanceCapability,
  LegalCheckAcceptanceInput,
  LegalCheckAcceptanceResult,
  LegalRecordAcceptanceInput,
  LegalRecordAcceptanceResult,
} from "../contracts/acceptance.contract";
import type { LegalAcceptanceRepository } from "./acceptance-repository";

function validText(value: string, max = 256): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= max;
}

function validOptionalText(value: string | null | undefined, max = 256): boolean {
  return value === null || value === undefined || validText(value, max);
}

function validSha256(value: string): boolean {
  return /^[a-fA-F0-9]{64}$/.test(value.trim());
}

function validCommon(input: LegalCheckAcceptanceInput): boolean {
  return (
    validText(input.principalId) &&
    validOptionalText(input.customerAccountId) &&
    validText(input.documentId) &&
    validText(input.documentVersionId) &&
    validText(input.acceptanceContext, 128) &&
    validText(input.slaVersion, 128) &&
    validSha256(input.renderedContentSha256)
  );
}

function normalize<T extends LegalCheckAcceptanceInput>(input: T): T {
  return {
    ...input,
    principalId: input.principalId.trim(),
    customerAccountId: input.customerAccountId?.trim() || null,
    documentId: input.documentId.trim(),
    documentVersionId: input.documentVersionId.trim(),
    acceptanceContext: input.acceptanceContext.trim(),
    slaVersion: input.slaVersion.trim(),
    renderedContentSha256: input.renderedContentSha256.trim().toLowerCase(),
  };
}

export function createLegalAcceptanceCapability(
  repository: LegalAcceptanceRepository,
): LegalAcceptanceCapability {
  return Object.freeze({
    async record(input: LegalRecordAcceptanceInput): Promise<LegalRecordAcceptanceResult> {
      if (!validCommon(input) || input.variablesSnapshot === undefined) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }
      try {
        return await repository.record(normalize(input));
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },

    async check(input: LegalCheckAcceptanceInput): Promise<LegalCheckAcceptanceResult> {
      if (!validCommon(input)) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }
      try {
        return await repository.check(normalize(input));
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}

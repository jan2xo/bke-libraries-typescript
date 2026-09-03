export const LEGAL_ACCEPTANCE_CAPABILITY_ID = "bke.legal.acceptance.v1" as const;

export interface LegalRecordAcceptanceInput {
  readonly principalId: string;
  readonly customerAccountId?: string | null;
  readonly documentId: string;
  readonly documentVersionId: string;
  readonly acceptanceContext: string;
  readonly slaVersion: string;
  readonly renderedContentSha256: string;
  readonly variablesSnapshot: unknown;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
}

export interface LegalCheckAcceptanceInput {
  readonly principalId: string;
  readonly customerAccountId?: string | null;
  readonly documentId: string;
  readonly documentVersionId: string;
  readonly acceptanceContext: string;
  readonly slaVersion: string;
  readonly renderedContentSha256: string;
}

export interface LegalAcceptanceSnapshot {
  readonly acceptanceId: string;
  readonly principalId: string;
  readonly customerAccountId: string | null;
  readonly documentId: string;
  readonly documentVersionId: string;
  readonly acceptanceContext: string;
  readonly slaVersion: string;
  readonly renderedContentSha256: string;
  readonly variablesSnapshot: unknown;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly acceptedAt: Date;
}

export type LegalRecordAcceptanceResult =
  | { readonly status: "RECORDED"; readonly value: LegalAcceptanceSnapshot }
  | {
      readonly status: "REJECTED";
      readonly code: "DOCUMENT_VERSION_NOT_FOUND" | "DOCUMENT_VERSION_MISMATCH";
    }
  | { readonly status: "FAILED"; readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE" };

export type LegalCheckAcceptanceResult =
  | { readonly status: "ACCEPTED"; readonly value: LegalAcceptanceSnapshot }
  | { readonly status: "NOT_ACCEPTED" }
  | { readonly status: "FAILED"; readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE" };

export interface LegalAcceptanceCapability {
  record(input: LegalRecordAcceptanceInput): Promise<LegalRecordAcceptanceResult>;
  check(input: LegalCheckAcceptanceInput): Promise<LegalCheckAcceptanceResult>;
}

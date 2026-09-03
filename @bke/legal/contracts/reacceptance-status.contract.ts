import type { LegalDocumentType } from "./checkout-requirements.contract";

export const LEGAL_REACCEPTANCE_STATUS_CAPABILITY_ID =
  "bke.legal.reacceptance-status.v1" as const;

export interface LegalReacceptanceStatusInput {
  readonly principalId: string;
  readonly principalEstablishedAt: Date;
}

export interface LegalPendingReacceptanceSnapshot {
  readonly documentId: string;
  readonly documentType: LegalDocumentType;
  readonly title: string;
  readonly slug: string;
  readonly documentVersionId: string;
  readonly version: string;
  readonly publishedAt: Date;
}

export type LegalReacceptanceStatusResult =
  | { readonly status: "CURRENT"; readonly pending: readonly [] }
  | {
      readonly status: "REACCEPTANCE_REQUIRED";
      readonly pending: readonly LegalPendingReacceptanceSnapshot[];
    }
  | {
      readonly status: "FAILED";
      readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE";
    };

export interface LegalReacceptanceStatusCapability {
  check(input: LegalReacceptanceStatusInput): Promise<LegalReacceptanceStatusResult>;
}

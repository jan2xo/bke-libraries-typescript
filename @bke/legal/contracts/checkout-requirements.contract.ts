export const LEGAL_CHECKOUT_REQUIREMENTS_CAPABILITY_ID =
  "bke.legal.checkout-requirements.v1" as const;

export const LEGAL_DOCUMENT_TYPES = [
  "TERMS_OF_SERVICE",
  "PRIVACY_POLICY",
  "SOFTWARE_LICENSE_AGREEMENT",
  "SUBSCRIPTION_TERMS",
  "REFUND_POLICY",
  "ACCEPTABLE_USE_POLICY",
  "COOKIE_POLICY",
  "SUPPORT_POLICY",
  "DATA_PROCESSING_ADDENDUM",
] as const;

export type LegalDocumentType = (typeof LEGAL_DOCUMENT_TYPES)[number];
export type LegalCheckoutPlanType = "PERPETUAL" | "MONTHLY" | "ANNUAL";

export interface LegalCheckoutRequirementSnapshot {
  readonly documentId: string;
  readonly documentType: LegalDocumentType;
  readonly title: string;
  readonly slug: string;
  readonly documentVersionId: string;
  readonly version: string;
  readonly slaVersion: string;
  readonly publishedContentSha256: string;
  readonly renderedContentSha256: string;
  readonly variablesSnapshot: Readonly<Record<string, string>>;
  readonly requiresReacceptance: boolean;
}

export interface LegalResolveCheckoutRequirementsInput {
  readonly planType: LegalCheckoutPlanType;
  readonly selectedVersionIds?: readonly string[];
  readonly variables?: Readonly<Record<string, string>>;
}

export type LegalResolveCheckoutRequirementsResult =
  | {
      readonly status: "RESOLVED";
      readonly requirements: readonly LegalCheckoutRequirementSnapshot[];
    }
  | {
      readonly status: "REJECTED";
      readonly code: "LEGAL_ACCEPTANCE_REQUIRED";
    }
  | {
      readonly status: "FAILED";
      readonly code: "INVALID_INPUT" | "LEGAL_DOCUMENTS_UNAVAILABLE" | "PERSISTENCE_UNAVAILABLE";
    };

export interface LegalCheckoutRequirementsCapability {
  resolve(input: LegalResolveCheckoutRequirementsInput): Promise<LegalResolveCheckoutRequirementsResult>;
}

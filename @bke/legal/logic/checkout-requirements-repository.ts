import type { LegalDocumentType } from "../contracts/checkout-requirements.contract";

export interface LegalCheckoutRequirementSource {
  readonly documentId: string;
  readonly documentType: LegalDocumentType;
  readonly title: string;
  readonly slug: string;
  readonly documentVersionId: string;
  readonly version: string;
  readonly slaVersion: string;
  readonly publishedContentSha256: string;
  readonly markdownContent: string;
  readonly requiresReacceptance: boolean;
}

export interface LegalCheckoutRequirementsRepository {
  findCurrent(
    documentTypes: readonly LegalDocumentType[],
  ): Promise<readonly LegalCheckoutRequirementSource[]>;
}

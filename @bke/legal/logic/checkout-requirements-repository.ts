import type {
  LegalCheckoutRequirementSnapshot,
  LegalDocumentType,
} from "../contracts/checkout-requirements.contract";

export interface LegalCheckoutRequirementsRepository {
  findCurrent(
    documentTypes: readonly LegalDocumentType[],
  ): Promise<readonly LegalCheckoutRequirementSnapshot[]>;
}

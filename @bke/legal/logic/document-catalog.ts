import type { LegalDocumentType } from "../contracts/checkout-requirements.contract";

export type LegalDocumentDefinition = Readonly<{
  title: string;
  slug: string;
}>;

export const LEGAL_DOCUMENT_DEFINITIONS: Readonly<Record<LegalDocumentType, LegalDocumentDefinition>> = Object.freeze({
  TERMS_OF_SERVICE: Object.freeze({ title: "Terms of Service", slug: "terms" }),
  PRIVACY_POLICY: Object.freeze({ title: "Privacy Policy", slug: "privacy" }),
  SOFTWARE_LICENSE_AGREEMENT: Object.freeze({ title: "Software License Agreement (EULA)", slug: "eula" }),
  SUBSCRIPTION_TERMS: Object.freeze({ title: "Subscription Terms", slug: "subscription" }),
  REFUND_POLICY: Object.freeze({ title: "Refund Policy", slug: "refund" }),
  ACCEPTABLE_USE_POLICY: Object.freeze({ title: "Acceptable Use Policy", slug: "acceptable-use" }),
  COOKIE_POLICY: Object.freeze({ title: "Cookie Policy", slug: "cookies" }),
  SUPPORT_POLICY: Object.freeze({ title: "Support Policy", slug: "support" }),
  DATA_PROCESSING_ADDENDUM: Object.freeze({ title: "Data Processing Addendum", slug: "dpa" }),
});

export const REGISTRATION_LEGAL_TYPES: readonly LegalDocumentType[] = Object.freeze([
  "TERMS_OF_SERVICE",
  "PRIVACY_POLICY",
]);

export const CHECKOUT_LEGAL_TYPES: readonly LegalDocumentType[] = Object.freeze([
  "SOFTWARE_LICENSE_AGREEMENT",
  "REFUND_POLICY",
]);

export const SUBSCRIPTION_LEGAL_TYPES: readonly LegalDocumentType[] = Object.freeze([
  "SUBSCRIPTION_TERMS",
]);

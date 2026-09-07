import { describe, expect, it } from "vitest";
import { LEGAL_DOCUMENT_TYPES } from "../contracts/checkout-requirements.contract";
import {
  CHECKOUT_LEGAL_TYPES,
  LEGAL_DOCUMENT_DEFINITIONS,
  REGISTRATION_LEGAL_TYPES,
  SUBSCRIPTION_LEGAL_TYPES,
} from "../logic/document-catalog";

describe("Legal canonical document catalog", () => {
  it("defines every legal document type exactly once", () => {
    expect(Object.keys(LEGAL_DOCUMENT_DEFINITIONS)).toEqual([...LEGAL_DOCUMENT_TYPES]);
  });

  it("preserves the V1 canonical titles and slugs", () => {
    expect(LEGAL_DOCUMENT_DEFINITIONS).toEqual({
      TERMS_OF_SERVICE: { title: "Terms of Service", slug: "terms" },
      PRIVACY_POLICY: { title: "Privacy Policy", slug: "privacy" },
      SOFTWARE_LICENSE_AGREEMENT: { title: "Software License Agreement (EULA)", slug: "eula" },
      SUBSCRIPTION_TERMS: { title: "Subscription Terms", slug: "subscription" },
      REFUND_POLICY: { title: "Refund Policy", slug: "refund" },
      ACCEPTABLE_USE_POLICY: { title: "Acceptable Use Policy", slug: "acceptable-use" },
      COOKIE_POLICY: { title: "Cookie Policy", slug: "cookies" },
      SUPPORT_POLICY: { title: "Support Policy", slug: "support" },
      DATA_PROCESSING_ADDENDUM: { title: "Data Processing Addendum", slug: "dpa" },
    });
  });

  it("preserves registration, checkout, and subscription requirement groups", () => {
    expect(REGISTRATION_LEGAL_TYPES).toEqual(["TERMS_OF_SERVICE", "PRIVACY_POLICY"]);
    expect(CHECKOUT_LEGAL_TYPES).toEqual(["SOFTWARE_LICENSE_AGREEMENT", "REFUND_POLICY"]);
    expect(SUBSCRIPTION_LEGAL_TYPES).toEqual(["SUBSCRIPTION_TERMS"]);
  });
});

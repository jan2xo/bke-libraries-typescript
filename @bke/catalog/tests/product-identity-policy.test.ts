import { describe, expect, it } from "vitest";
import {
  CATALOG_PRODUCT_ID_MAX_LENGTH,
  assertCatalogProductIdChangeAllowed,
  isCatalogProductId,
  normalizeCatalogProductId,
} from "../logic/product-identity-policy";

describe("catalog product identity policy", () => {
  it("matches the stable lowercase-hyphen product ID grammar", () => {
    for (const value of ["a", "bke-air-stack", "a1", "bke-1", `a${"1".repeat(CATALOG_PRODUCT_ID_MAX_LENGTH - 1)}`]) {
      expect(isCatalogProductId(value)).toBe(true);
    }
    for (const value of ["", "1bke", "BKE-air-stack", "bke_air_stack", "bke.air.stack", "bke--air", "bke-air-", "bke air", `a${"1".repeat(CATALOG_PRODUCT_ID_MAX_LENGTH)}`]) {
      expect(isCatalogProductId(value)).toBe(false);
    }
  });

  it("trims outer whitespace before validating", () => {
    expect(normalizeCatalogProductId("  bke-air-stack  ")).toBe("bke-air-stack");
  });

  it("preserves the exact immutable-after-lifecycle-lock decision", () => {
    expect(assertCatalogProductIdChangeAllowed({ existingProductId: "bke-air-stack", requestedProductId: "bke-air-stack", lifecycleLocked: true })).toBe("bke-air-stack");
    expect(assertCatalogProductIdChangeAllowed({ existingProductId: "bke-air-stack", requestedProductId: "bke-air-stack-next", lifecycleLocked: false })).toBe("bke-air-stack-next");
    expect(assertCatalogProductIdChangeAllowed({ existingProductId: null, requestedProductId: "bke-air-stack", lifecycleLocked: true })).toBe("bke-air-stack");
    expect(() => assertCatalogProductIdChangeAllowed({ existingProductId: "bke-air-stack", requestedProductId: "bke-air-stack-next", lifecycleLocked: true })).toThrow("PRODUCT_ID_IMMUTABLE");
  });

  it("rejects malformed requested IDs before evaluating immutability", () => {
    expect(() => assertCatalogProductIdChangeAllowed({ existingProductId: "bke-air-stack", requestedProductId: "BKE_AIR_STACK", lifecycleLocked: false })).toThrow("INVALID_PRODUCT_ID");
  });
});

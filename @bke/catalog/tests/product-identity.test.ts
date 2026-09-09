import { describe, expect, it } from "vitest";
import {
  CANONICAL_PRODUCT_ID_MAX_LENGTH,
  assertProductIdChangeAllowed,
  isCanonicalProductId,
} from "../logic/product-identity";

describe("canonical product identity policy", () => {
  it("accepts the V1 canonical lowercase hyphenated grammar after trimming", () => {
    expect(isCanonicalProductId("bke-air-stack")).toBe(true);
    expect(isCanonicalProductId(" airstack ")).toBe(true);
    expect(isCanonicalProductId(`a${"b".repeat(CANONICAL_PRODUCT_ID_MAX_LENGTH - 1)}`)).toBe(true);
  });

  it("rejects identities outside the V1 grammar or length limit", () => {
    expect(isCanonicalProductId("AirStack")).toBe(false);
    expect(isCanonicalProductId("air_stack")).toBe(false);
    expect(isCanonicalProductId("air.stack")).toBe(false);
    expect(isCanonicalProductId("1-airstack")).toBe(false);
    expect(isCanonicalProductId("air--stack")).toBe(false);
    expect(isCanonicalProductId(`a${"b".repeat(CANONICAL_PRODUCT_ID_MAX_LENGTH)}`)).toBe(false);
  });

  it("allows initial assignment, unchanged identity, and unlocked changes", () => {
    expect(() => assertProductIdChangeAllowed({ existingProductId: null, requestedProductId: "bke-air-stack", lifecycleLocked: true })).not.toThrow();
    expect(() => assertProductIdChangeAllowed({ existingProductId: "bke-air-stack", requestedProductId: "bke-air-stack", lifecycleLocked: true })).not.toThrow();
    expect(() => assertProductIdChangeAllowed({ existingProductId: "bke-air-stack", requestedProductId: "bke-air-stack-next", lifecycleLocked: false })).not.toThrow();
  });

  it("rejects rebinding a lifecycle-locked external identity", () => {
    expect(() => assertProductIdChangeAllowed({ existingProductId: "bke-air-stack", requestedProductId: "bke-other", lifecycleLocked: true })).toThrow("PRODUCT_ID_IMMUTABLE");
  });
});

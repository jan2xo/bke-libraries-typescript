const canonicalProductIdPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export const CANONICAL_PRODUCT_ID_MAX_LENGTH = 80;

/**
 * Stable external software/licensing identity.
 *
 * This is intentionally distinct from a database identifier or catalog slug.
 * Callers that need the normalized value should trim before persistence; this
 * predicate mirrors the canonical grammar after trimming.
 */
export function isCanonicalProductId(value: string): boolean {
  const normalized = value.trim();
  return normalized.length <= CANONICAL_PRODUCT_ID_MAX_LENGTH &&
    canonicalProductIdPattern.test(normalized);
}

/**
 * Once a product participates in an operational lifecycle, its externally
 * visible product identity cannot be rebound to a different value.
 */
export function assertProductIdChangeAllowed(input: Readonly<{
  existingProductId: string | null;
  requestedProductId: string;
  lifecycleLocked: boolean;
}>): void {
  if (
    input.existingProductId &&
    input.existingProductId !== input.requestedProductId &&
    input.lifecycleLocked
  ) {
    throw new Error("PRODUCT_ID_IMMUTABLE");
  }
}

export const CATALOG_PRODUCT_ID_MAX_LENGTH = 80;

const CATALOG_PRODUCT_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function normalizeCatalogProductId(value: string): string {
  const normalized = value.trim();
  if (
    normalized.length > CATALOG_PRODUCT_ID_MAX_LENGTH ||
    !CATALOG_PRODUCT_ID_PATTERN.test(normalized)
  ) {
    throw new Error("INVALID_PRODUCT_ID");
  }
  return normalized;
}

export function isCatalogProductId(value: string): boolean {
  try {
    normalizeCatalogProductId(value);
    return true;
  } catch {
    return false;
  }
}

export function assertCatalogProductIdChangeAllowed(input: {
  readonly existingProductId: string | null;
  readonly requestedProductId: string;
  readonly lifecycleLocked: boolean;
}): string {
  const requestedProductId = normalizeCatalogProductId(input.requestedProductId);
  if (
    input.existingProductId &&
    input.existingProductId !== requestedProductId &&
    input.lifecycleLocked
  ) {
    throw new Error("PRODUCT_ID_IMMUTABLE");
  }
  return requestedProductId;
}

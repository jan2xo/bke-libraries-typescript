import semver from "semver";

export const CATALOG_EXTERNAL_PRODUCT_ID_MAX_LENGTH = 80;
export const CATALOG_EXTERNAL_PRODUCT_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function isCatalogExternalProductId(value: string): boolean {
  return value.length <= CATALOG_EXTERNAL_PRODUCT_ID_MAX_LENGTH && CATALOG_EXTERNAL_PRODUCT_ID_PATTERN.test(value);
}

export function isCatalogAcceptedVersion(value: string): boolean {
  return semver.valid(value) !== null;
}

export function validateCatalogAcceptedVersionRange(
  minimum: string | null | undefined,
  maximum: string | null | undefined,
): { readonly minimum: string | null; readonly maximum: string | null } {
  const min = minimum ? semver.valid(minimum) : null;
  const max = maximum ? semver.valid(maximum) : null;
  if ((minimum && !min) || (maximum && !max) || (min && max && semver.gt(min, max))) {
    throw new Error("INVALID_VERSION_POLICY");
  }
  return Object.freeze({ minimum: min, maximum: max });
}

export function isCatalogVersionAccepted(
  version: string,
  minimum: string | null | undefined,
  maximum: string | null | undefined,
): boolean {
  const parsed = semver.valid(version);
  if (!parsed) throw new Error("INVALID_LICENSE_VERSION");
  const range = validateCatalogAcceptedVersionRange(minimum, maximum);
  return (!range.minimum || semver.gte(parsed, range.minimum)) &&
    (!range.maximum || semver.lte(parsed, range.maximum));
}

export function assertCatalogExternalProductIdChangeAllowed(input: {
  readonly existingProductId: string | null;
  readonly requestedProductId: string;
  readonly lifecycleLocked: boolean;
}): void {
  if (
    input.existingProductId &&
    input.existingProductId !== input.requestedProductId &&
    input.lifecycleLocked
  ) {
    throw new Error("PRODUCT_ID_IMMUTABLE");
  }
}

import semver from "semver";

/**
 * Validate the normalized semantic-version syntax used by accepted-version
 * policy inputs. Host request schemas may trim before calling this predicate.
 */
export function isAcceptedVersionSyntax(value: string): boolean {
  return semver.valid(value) !== null;
}

export function validateAcceptedVersionRange(
  minimum: string | null | undefined,
  maximum: string | null | undefined,
) {
  const min = minimum ? semver.valid(minimum) : null;
  const max = maximum ? semver.valid(maximum) : null;
  if ((minimum && !min) || (maximum && !max) || (min && max && semver.gt(min, max))) {
    throw new Error("INVALID_VERSION_POLICY");
  }
  return { minimum: min, maximum: max };
}

export function isVersionAccepted(
  version: string,
  minimum: string | null | undefined,
  maximum: string | null | undefined,
) {
  const parsed = semver.valid(version);
  if (!parsed) throw new Error("INVALID_LICENSE_VERSION");
  const range = validateAcceptedVersionRange(minimum, maximum);
  return (!range.minimum || semver.gte(parsed, range.minimum)) &&
    (!range.maximum || semver.lte(parsed, range.maximum));
}

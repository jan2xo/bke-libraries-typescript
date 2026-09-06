import semver from "semver";

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

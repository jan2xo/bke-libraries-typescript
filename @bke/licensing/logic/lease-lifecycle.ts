export type LeaseTimes = Readonly<{
  issuedAt: Date;
  refreshAfter: Date;
  expiresAt: Date;
}>;

export type LeaseIdentitySnapshot = Readonly<{
  licenseId: string;
  deviceId: string;
  packageFamily: string;
  packageIdentityKey: string;
  releaseIdentityKey: string;
  clientVersion: string;
  leaseKeyId: string;
  expiresAt: Date;
}>;

export function calculateLeaseTimes(
  now: Date,
  refreshAfterSeconds: number,
  hardExpirySeconds: number,
): LeaseTimes {
  if (
    !Number.isInteger(refreshAfterSeconds) ||
    refreshAfterSeconds <= 0 ||
    !Number.isInteger(hardExpirySeconds) ||
    hardExpirySeconds <= 0 ||
    refreshAfterSeconds >= hardExpirySeconds
  ) {
    throw new Error("INVALID_LICENSE_POLICY");
  }

  return Object.freeze({
    issuedAt: new Date(now),
    refreshAfter: new Date(now.getTime() + refreshAfterSeconds * 1000),
    expiresAt: new Date(now.getTime() + hardExpirySeconds * 1000),
  });
}

export function validateClientCompatibility(
  clientVersion: string,
  minSupportedVersion: string,
): void {
  const parse = (value: string) => {
    if (!/^\d+\.\d+\.\d+$/.test(value)) throw new Error("CLIENT_VERSION_MISMATCH");
    return value.split(".").map((part) => Number(part));
  };

  const client = parse(clientVersion);
  const minimum = parse(minSupportedVersion);
  for (let index = 0; index < 3; index += 1) {
    if (client[index]! > minimum[index]!) return;
    if (client[index]! < minimum[index]!) throw new Error("CLIENT_VERSION_MISMATCH");
  }
}

export function isLeaseExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

export function isRefreshDue(refreshAfter: Date, now: Date): boolean {
  return refreshAfter.getTime() <= now.getTime();
}

export function leaseClaimsAreCurrent(
  claims: LeaseIdentitySnapshot,
  expected: LeaseIdentitySnapshot & Readonly<{ now: Date }>,
): boolean {
  return (
    claims.licenseId === expected.licenseId &&
    claims.deviceId === expected.deviceId &&
    claims.packageFamily === expected.packageFamily &&
    claims.packageIdentityKey === expected.packageIdentityKey &&
    claims.releaseIdentityKey === expected.releaseIdentityKey &&
    claims.clientVersion === expected.clientVersion &&
    claims.leaseKeyId === expected.leaseKeyId &&
    claims.expiresAt.getTime() > expected.now.getTime()
  );
}

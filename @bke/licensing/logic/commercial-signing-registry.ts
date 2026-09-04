export type CommercialSigningKeyRecord = Readonly<{
  keyId: string;
  privateKeyReference: string;
  algorithm: string;
  status: string;
  activeFrom: Date;
  activeTo: Date | null;
  revokedAt: Date | null;
}>;

function isActive(key: CommercialSigningKeyRecord, now: Date): boolean {
  return (
    key.status === "ACTIVE" &&
    key.revokedAt === null &&
    key.activeFrom.getTime() <= now.getTime() &&
    (key.activeTo === null || key.activeTo.getTime() > now.getTime())
  );
}

export function selectActiveCommercialSigningKey(
  keys: readonly CommercialSigningKeyRecord[],
  now: Date,
): CommercialSigningKeyRecord {
  const active = keys
    .filter((key) => isActive(key, now))
    .sort((left, right) => right.activeFrom.getTime() - left.activeFrom.getTime())[0];
  if (!active) throw new Error("COMMERCIAL_SIGNING_KEY_UNAVAILABLE");
  return active;
}

export function resolveCommercialSigningKey(
  keys: readonly CommercialSigningKeyRecord[],
  keyId: string,
  now: Date,
): CommercialSigningKeyRecord {
  const key = keys.find((candidate) => candidate.keyId === keyId);
  if (!key || !isActive(key, now)) throw new Error("COMMERCIAL_SIGNING_KEY_UNAVAILABLE");
  return key;
}

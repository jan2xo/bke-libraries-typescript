export type CommercialSigningKeyRecord = Readonly<{
  id: string;
  keyId: string;
  algorithm: string;
  status: string;
  publicKey: string;
  privateKeyReference: string;
  createdAt: Date;
  activatedAt: Date;
  retiredAt: Date | null;
  rotationReason: string | null;
  createdBy: string | null;
}>;

export type CommercialSigningKeyBootstrap = Readonly<{
  keyId: string;
  publicKey: string;
  privateKeyReference: string;
}>;

export function resolveCommercialPrivateKey(
  reference: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const prefix = "env:";
  if (!reference.startsWith(prefix)) throw new Error("SIGNING_KEY_REFERENCE_UNSUPPORTED");
  const value = environment[reference.slice(prefix.length)];
  if (!value) throw new Error("SIGNING_KEY_UNRESOLVED");
  return value;
}

export function selectActiveCommercialSigningKey(
  keys: readonly CommercialSigningKeyRecord[],
): CommercialSigningKeyRecord {
  const active = keys.filter((key) => key.status === "ACTIVE");
  if (active.length !== 1) {
    throw new Error(active.length === 0 ? "NO_ACTIVE_SIGNING_KEY" : "MULTIPLE_ACTIVE_SIGNING_KEYS");
  }
  return active[0]!;
}

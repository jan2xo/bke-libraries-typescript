export type CurrentCommercialLease = Readonly<{
  version: string;
  expiresAt: Date | null;
  installationId: string;
  deviceId: string;
  signerKeyId: string | null;
  status: string;
  serverRevision: number;
}>;

export type ExpectedCommercialLease = Readonly<{
  version: string;
  expiresAt: Date | null;
  installationId: string;
  deviceId: string;
  signerKeyId: string;
}>;

export function refreshRequiresReplacement(
  current: CurrentCommercialLease,
  expected: ExpectedCommercialLease,
): boolean {
  return (
    current.status !== "ACTIVE" ||
    current.version !== expected.version ||
    current.expiresAt?.getTime() !== expected.expiresAt?.getTime() ||
    current.installationId !== expected.installationId ||
    current.deviceId !== expected.deviceId ||
    current.signerKeyId !== expected.signerKeyId ||
    current.serverRevision < 1
  );
}

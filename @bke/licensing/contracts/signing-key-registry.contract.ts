export const LICENSING_SIGNING_KEY_REGISTRY_CAPABILITY_ID =
  "bke.licensing.signing-key-registry.v1" as const;

export type LicensingSigningKeyStatus = "ACTIVE" | "RETIRED";

export type LicensingSigningKeyPublicSnapshot = Readonly<{
  keyId: string;
  algorithm: string;
  publicKey: string;
  status: LicensingSigningKeyStatus;
  activatedAt: Date;
  retiredAt: Date | null;
}>;

export type LicensingSigningKeyActiveSnapshot = LicensingSigningKeyPublicSnapshot & Readonly<{
  privateKeyReference: string;
}>;

export interface LicensingSigningKeyRegistryCapability {
  ensure(): Promise<void>;
  active(): Promise<LicensingSigningKeyActiveSnapshot>;
  listPublic(): Promise<readonly LicensingSigningKeyPublicSnapshot[]>;
}

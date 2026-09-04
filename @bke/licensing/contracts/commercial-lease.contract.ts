export const LICENSING_COMMERCIAL_LEASE_CAPABILITY_ID = "bke.licensing.commercial-lease.v1" as const;

export const commercialLeaseActions = [
  "ACTIVATION",
  "REFRESH",
  "RENEWAL",
  "TRANSFER",
  "REPLACEMENT",
  "REVOCATION_REPLACEMENT",
  "KEY_ROTATION",
] as const;

export type CommercialLeaseAction = (typeof commercialLeaseActions)[number];

export type CommercialLeasePayload = Readonly<{
  license_id: string;
  lease_id: string;
  generation: number;
  server_revision: number;
  product_id: string;
  installation_id: string;
  device_id: string;
  version: string;
  issuer: string;
  issued_at: string;
  not_before: string;
  expires_at: string;
  key_id: string;
  algorithm: "Ed25519";
  revoked: boolean;
  superseded_by: string | null;
}>;

export type CommercialLeaseEnvelope = Readonly<{
  payload: string;
  signature: string;
  key_id: string;
  algorithm: "Ed25519";
}>;

export type CommercialLeaseRequest = Readonly<{
  licenseKey: string;
  installationId: string;
  deviceId: string;
  operationId: string;
  productVersion: string;
  action?: CommercialLeaseAction;
  label?: string;
  operatingSystem?: string;
  architecture?: string;
  predecessorLeaseId?: string;
  now?: Date;
}>;

export type CommercialLicenseContext = Readonly<{
  licenseId: string;
  licenseStatus: string;
  licenseExpiresAt: Date | null;
  accountLifecycleState: string;
  subscriptionStatus: string | null;
  productId: string | null;
  productVersionEligible: boolean;
  versionAccepted: boolean;
  maxSeats: number;
  maxDevicesPerSeat: number;
}>;

export type CommercialLeaseResult = Readonly<{
  lease: CommercialLeaseEnvelope;
}>;

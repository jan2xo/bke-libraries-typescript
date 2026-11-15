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
  orderItemId: string;
  licenseStatus: string;
  licenseExpiresAt: Date | null;
  accountLifecycleState: string;
  subscriptionStatus: string | null;
  productId: string | null;
  productVersionEligible: boolean;
  minimumAcceptedVersion: string | null;
  maximumAcceptedVersion: string | null;
  maxSeats: number;
  maxDevicesPerSeat: number;
}>;

export type CommercialLeaseResult = Readonly<{
  lease: CommercialLeaseEnvelope;
}>;

export type CommercialLeaseTrustedKey = Readonly<{
  publicKey: string;
  status: "ACTIVE" | "VERIFY_ONLY" | "RETIRED" | "REVOKED";
}>;

export type CommercialLeaseVerificationContext = Readonly<{
  issuer: string;
  productId: string;
  installationId: string;
  deviceId: string;
  version: string;
  now: Date;
  allowedFutureSkewMs?: number;
  disallowPublicTestKeys?: boolean;
}>;

export type CommercialLeaseVerificationFailureReason =
  | "MALFORMED_ENVELOPE"
  | "UNTRUSTED_KEY_ID"
  | "INVALID_SIGNATURE"
  | "INVALID_PAYLOAD"
  | "LEASE_REVOKED"
  | "LEASE_SUPERSEDED"
  | "SCOPE_MISMATCH"
  | "FUTURE_ISSUED_AT"
  | "NOT_YET_VALID"
  | "EXPIRED";

export type CommercialLeaseVerificationResult =
  | Readonly<{ ok: true; payload: CommercialLeasePayload; keyId: string }>
  | Readonly<{ ok: false; reason: CommercialLeaseVerificationFailureReason }>;

export const LICENSING_COMMERCIAL_LEASE_CAPABILITY_ID = "bke.licensing.commercial-lease.v1" as const;

export type CommercialLeaseAction = "ISSUE" | "REFRESH";
export type CommercialLeaseDecision = "ISSUED" | "REFRESHED" | "UNCHANGED";

export type CommercialLicensePolicy = Readonly<{
  maxDevices: number;
  transferable: boolean;
  refreshAfterSeconds: number;
  hardExpirySeconds: number;
}>;

export type CommercialProductIdentity = Readonly<{
  packageFamily: string;
  packageIdentityKey: string;
  releaseIdentityKey: string;
  contractVersion: string;
  entitlements: readonly string[];
}>;

export type CommercialLicenseContext = Readonly<{
  licenseId: string;
  accountId: string;
  licenseActive: boolean;
  accountActive: boolean;
  subscriptionActive: boolean;
  versionAccepted: boolean;
  minSupportedVersion: string;
  policy: CommercialLicensePolicy;
  identity: CommercialProductIdentity;
}>;

export type CommercialLeaseRequest = Readonly<{
  licenseKey: string;
  clientVersion: string;
  fingerprint: string;
  installationId: string;
  idempotencyKey: string;
  requestedAction?: CommercialLeaseAction;
  now?: Date;
}>;

export type CommercialLeaseClaims = Readonly<{
  sub: string;
  licenseId: string;
  deviceId: string;
  productId: string;
  productVersionId: string;
  packageFamily: string;
  packageIdentityKey: string;
  releaseIdentityKey: string;
  clientVersion: string;
  contractVersion: string;
  entitlements: readonly string[];
  signingKeyId: string;
  leaseKeyId: string;
  leaseKeyIssuedAt: number;
  iat: number;
  nbf: number;
  refreshAfter: number;
  exp: number;
  jti: string;
}>;

export type CommercialLeaseResult = Readonly<{
  token: string;
  lease: Readonly<{
    tokenId: string;
    issuedAt: Date;
    refreshAfter: Date;
    expiresAt: Date;
    signingKeyId: string;
  }>;
  operation: Readonly<{
    id: string;
    action: CommercialLeaseAction;
    decision: CommercialLeaseDecision;
    reasonCode: string;
  }>;
}>;

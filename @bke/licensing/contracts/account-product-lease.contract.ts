/**
 * Pure, portable signed product-execution license wire contract.
 *
 * DS #340 owns real authorization policy and signing-key custody; no account
 * entitlement or customer secret is managed by this reusable package.
 */
export const ACCOUNT_PRODUCT_LEASE_SCHEMA = "bke.product-lease.v1" as const;
export const ACCOUNT_PRODUCT_LEASE_JWS_TYP = "bke.product-lease.v1+jws" as const;
export const ACCOUNT_PRODUCT_LEASE_CAPABILITY_ID =
  "bke.licensing.account-product-lease.v1" as const;

export const ACCOUNT_PRODUCT_LEASE_ACTIONS = ["OPEN", "USE"] as const;
export type AccountProductLeaseAction = (typeof ACCOUNT_PRODUCT_LEASE_ACTIONS)[number];
export type AgentKeyProtection = "tpm" | "software";

export type AccountProductLeaseClaims = Readonly<{
  schema: typeof ACCOUNT_PRODUCT_LEASE_SCHEMA;
  issuer: string;
  audience: string;
  leaseId: string;
  accountId: string;
  userId: string;
  productId: string;
  agentSessionId: string;
  /**
   * Base64url(SHA-256(SPKI DER public key)); product separately proves
   * non-exportable Agent private-key possession using a fresh challenge.
   */
  agentKeyThumbprint: string;
  /** A claimed value, NOT verified TPM attestation. */
  keyProtection: AgentKeyProtection;
  plan: string;
  allowedActions: readonly AccountProductLeaseAction[];
  /** Strict UTC ISO 8601 timestamp. */
  issuedAt: string;
  /** Agent renewal hint only: NOT a product authorization deadline. */
  refreshAfter: string;
  /** Single hard stop, online or offline; DS signs the maximum validity. */
  expiresAt: string;
}>;

export type AccountProductLeaseTrustedKey = Readonly<{
  publicKeyPem: string;
  /** VERIFY_ONLY permits outstanding valid leases during rotation. */
  state: "ACTIVE" | "VERIFY_ONLY" | "REVOKED";
}>;

export type AccountProductLeaseVerificationContext = Readonly<{
  issuer: string;
  audience: string;
  accountId: string;
  userId: string;
  productId: string;
  agentSessionId: string;
  agentKeyThumbprint: string;
  action: AccountProductLeaseAction;
  now: Date;
  /** Max clock skew for issuedAt; default 5 minutes. */
  allowedFutureSkewMs?: number;
}>;

export type AccountProductLeaseVerificationResult =
  | Readonly<{ ok: true; claims: AccountProductLeaseClaims; kid: string }>
  | Readonly<{ ok: false; reason:
      "MALFORMED_JWS" | "UNTRUSTED_KID" | "INVALID_SIGNATURE" |
      "INVALID_CLAIMS" | "CLAIM_MISMATCH" | "FUTURE_ISSUED_AT" | "EXPIRED" }>;

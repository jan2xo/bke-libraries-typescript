export const ENTITLEMENTS_DURABLE_RIGHT_REVOCATION_CAPABILITY_ID =
  "bke.entitlements.durable-right-revocation.v1" as const;

export interface EntitlementsRevokeDurableRightInput {
  readonly entitlementId: string;
  readonly revocationReference: string;
  readonly revocationSnapshot: unknown;
  readonly revokedAt: Date;
}

export interface EntitlementsDurableRightRevocationSnapshot {
  readonly entitlementId: string;
  readonly status: "REVOKED";
  readonly revocationReference: string;
  readonly revocationSnapshot: unknown;
  readonly revokedAt: Date;
}

export type EntitlementsRevokeDurableRightResult =
  | { readonly status: "REVOKED"; readonly value: EntitlementsDurableRightRevocationSnapshot }
  | { readonly status: "EXISTING"; readonly value: EntitlementsDurableRightRevocationSnapshot }
  | { readonly status: "REJECTED"; readonly code: "NOT_FOUND" | "REVOCATION_CONFLICT" }
  | { readonly status: "FAILED"; readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE" };

export interface EntitlementsDurableRightRevocationCapability {
  revoke(input: EntitlementsRevokeDurableRightInput): Promise<EntitlementsRevokeDurableRightResult>;
}

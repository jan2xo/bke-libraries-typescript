export const ENTITLEMENTS_DURABLE_RIGHT_GRANT_CAPABILITY_ID =
  "bke.entitlements.durable-right-grant.v1" as const;

export type EntitlementsDurableRightStatus = "ACTIVE";

export interface EntitlementsGrantDurableRightInput {
  readonly subjectId: string;
  readonly resourceId: string;
  readonly sourceReference: string;
  readonly quantity: number;
  readonly scopeSnapshot: unknown;
  readonly grantSnapshot: unknown;
  readonly validFrom: Date;
  readonly validUntil?: Date | null;
}

export interface EntitlementsDurableRightSnapshot {
  readonly entitlementId: string;
  readonly subjectId: string;
  readonly resourceId: string;
  readonly sourceReference: string;
  readonly status: EntitlementsDurableRightStatus;
  readonly quantity: number;
  readonly scopeSnapshot: unknown;
  readonly grantSnapshot: unknown;
  readonly validFrom: Date;
  readonly validUntil: Date | null;
  readonly createdAt: Date;
}

export type EntitlementsGrantDurableRightResult =
  | { readonly status: "GRANTED"; readonly value: EntitlementsDurableRightSnapshot }
  | { readonly status: "EXISTING"; readonly value: EntitlementsDurableRightSnapshot }
  | { readonly status: "REJECTED"; readonly code: "SOURCE_CONFLICT" }
  | { readonly status: "FAILED"; readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE" };

export interface EntitlementsDurableRightGrantCapability {
  grant(input: EntitlementsGrantDurableRightInput): Promise<EntitlementsGrantDurableRightResult>;
}

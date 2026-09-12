export const LICENSING_ENTITLEMENT_MANAGEMENT_CAPABILITY_ID =
  "bke.licensing.entitlement-management.v1" as const;

export interface LicensingOpaqueKeyMaterial {
  readonly publicId: string;
  readonly keyHash: string;
  readonly keyLastFour: string;
  readonly keyCiphertext: string;
}

export interface LicensingIssueEntitlementInput {
  readonly keyMaterial: LicensingOpaqueKeyMaterial;
  readonly accountId: string;
  readonly orderId: string;
  readonly orderItemId: string;
  readonly productId: string;
  readonly editionId?: string | null;
  readonly purchasePlanId?: string | null;
  readonly subscriptionId?: string | null;
  readonly maxSeats: number;
  readonly maxDevicesPerSeat: number;
  readonly expiresAt?: Date | null;
  readonly eventMetadata?: unknown;
}

export interface LicensingRenewSubscriptionEntitlementsInput {
  readonly subscriptionId: string;
  readonly orderId: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly effectiveAt: Date;
  readonly discountedCycleConsumed: boolean;
  readonly paymentId?: string | null;
  readonly paymentEventId?: string | null;
}

export interface LicensingEntitlementLicenseSnapshot {
  readonly id: string;
  readonly publicId: string;
  readonly subscriptionId: string | null;
  readonly status: "ACTIVE";
  readonly expiresAt: Date | null;
}

export interface LicensingRenewalOperationSnapshot {
  readonly operationId: string;
  readonly licenseId: string;
  readonly deviceHash: string | null;
  readonly status: "PREPARED" | "COMPLETED";
  readonly effectiveExpiry: Date;
}

export type LicensingEntitlementManagementResult =
  | {
      readonly status: "OK";
      readonly licenses: readonly LicensingEntitlementLicenseSnapshot[];
      readonly renewalOperations: readonly LicensingRenewalOperationSnapshot[];
    }
  | {
      readonly status: "FAILED";
      readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE";
    };

export interface LicensingEntitlementManagementCapability {
  issue(input: LicensingIssueEntitlementInput): Promise<LicensingEntitlementManagementResult>;
  renewSubscription(input: LicensingRenewSubscriptionEntitlementsInput): Promise<LicensingEntitlementManagementResult>;
}

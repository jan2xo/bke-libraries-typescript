export type LicensingLicenseStatus = "ACTIVE" | "SUSPENDED" | "EXPIRED" | "REVOKED";

export interface LicensingLicenseSnapshot {
  readonly id: string;
  readonly publicId: string;
  readonly keyLastFour: string;
  readonly keyRevealedAt: Date | null;
  readonly accountId: string;
  readonly orderId: string;
  readonly orderItemId: string;
  readonly productId: string;
  readonly editionId: string | null;
  readonly purchasePlanId: string | null;
  readonly subscriptionId: string | null;
  readonly status: LicensingLicenseStatus;
  readonly maxSeats: number;
  readonly maxDevicesPerSeat: number;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
}

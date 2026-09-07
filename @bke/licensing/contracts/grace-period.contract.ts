export const LICENSING_GRACE_PERIOD_CAPABILITY_ID = "bke.licensing.grace-period.v1" as const;

export const LICENSING_GRACE_PRODUCTS = Object.freeze(["airstack", "renderdock"] as const);
export type LicensingGraceProduct = (typeof LICENSING_GRACE_PRODUCTS)[number];

export type LicensingGraceStatuses = Readonly<Record<LicensingGraceProduct, boolean>>;

export type LicensingGraceMutation = Readonly<{
  productKey: LicensingGraceProduct;
  oldValue: boolean;
  newValue: boolean;
  operationSource: string;
}>;

export interface LicensingGracePeriodCapability {
  readState(productKey: LicensingGraceProduct): Promise<boolean>;
  readStatuses(): Promise<LicensingGraceStatuses>;
  setState(input: Readonly<{
    productKey: LicensingGraceProduct;
    graceEnabled: boolean;
    operationSource: string;
  }>): Promise<boolean>;
}

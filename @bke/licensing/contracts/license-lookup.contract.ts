import type { LicensingLicenseSnapshot } from "./license.contract";

export interface LicensingLicenseLookup {
  findByKeyHash(input: { readonly licenseKeyHash: string }): Promise<LicensingLicenseSnapshot | null>;
}

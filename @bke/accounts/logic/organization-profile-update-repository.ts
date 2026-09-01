import type { AccountsOrganizationProfileUpdateSnapshot } from "../contracts/organization-profile-update.contract";

export interface AccountsOrganizationProfileUpdateRecord {
  readonly accountId: string;
  readonly displayName?: string;
  readonly legalName?: string;
  readonly billingEmail?: string;
  readonly registrationNumber?: string | null;
  readonly taxId?: string | null;
}

export interface AccountsOrganizationProfileUpdateRepository {
  updateOrganizationProfile(
    record: AccountsOrganizationProfileUpdateRecord,
  ): Promise<AccountsOrganizationProfileUpdateSnapshot>;
}

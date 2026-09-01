import type { AccountsAccountSnapshot } from "../contracts/account.contract";
import type {
  AccountsOrganizationOwnerMembershipSnapshot,
  AccountsOrganizationProfileSnapshot,
} from "../contracts/organization-account-creation.contract";

export interface AccountsOrganizationAccountCreationRecord {
  readonly id: string;
  readonly ownerPrincipalId: string;
  readonly displayName: string;
  readonly legalName: string;
  readonly billingEmail: string;
  readonly registrationNumber: string | null;
  readonly taxId: string | null;
}

export interface AccountsOrganizationAccountCreationPersistenceResult {
  readonly account: AccountsAccountSnapshot & { readonly type: "ORGANIZATION" };
  readonly organization: AccountsOrganizationProfileSnapshot;
  readonly ownerMembership: AccountsOrganizationOwnerMembershipSnapshot;
}

export interface AccountsOrganizationAccountCreationRepository {
  createOrganizationAccount(
    record: AccountsOrganizationAccountCreationRecord,
  ): Promise<AccountsOrganizationAccountCreationPersistenceResult>;
}

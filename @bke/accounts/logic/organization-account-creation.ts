import type {
  AccountsOrganizationAccountCreationCapability,
  AccountsOrganizationAccountCreationInput,
  AccountsOrganizationAccountCreationResult,
} from "../contracts/organization-account-creation.contract";
import type { AccountsIdProvider } from "./accounts-id-provider";
import type { AccountsOrganizationAccountCreationRepository } from "./organization-account-creation-repository";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createAccountsOrganizationAccountCreationCapability(
  repository: AccountsOrganizationAccountCreationRepository,
  idProvider: AccountsIdProvider,
): AccountsOrganizationAccountCreationCapability {
  return Object.freeze({
    async create(
      input: AccountsOrganizationAccountCreationInput,
    ): Promise<AccountsOrganizationAccountCreationResult> {
      const ownerPrincipalId = input.ownerPrincipalId.trim();
      const displayName = input.displayName.trim();
      const legalName = input.legalName.trim();
      const billingEmail = input.billingEmail.trim().toLowerCase();
      const registrationNumber =
        input.registrationNumber === undefined ? null : input.registrationNumber.trim();
      const taxId = input.taxId === undefined ? null : input.taxId.trim();

      if (
        !ownerPrincipalId ||
        ownerPrincipalId.length > 256 ||
        displayName.length < 2 ||
        displayName.length > 120 ||
        legalName.length < 2 ||
        legalName.length > 180 ||
        billingEmail.length > 254 ||
        !EMAIL_PATTERN.test(billingEmail) ||
        (registrationNumber !== null && registrationNumber.length > 80) ||
        (taxId !== null && taxId.length > 80)
      ) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      let accountId: string;
      try {
        accountId = idProvider.issue().trim();
      } catch {
        return { status: "FAILED", code: "ID_PROVIDER_UNAVAILABLE" };
      }
      if (!accountId) {
        return { status: "FAILED", code: "ID_PROVIDER_UNAVAILABLE" };
      }

      try {
        const persisted = await repository.createOrganizationAccount({
          id: accountId,
          ownerPrincipalId,
          displayName,
          legalName,
          billingEmail,
          registrationNumber,
          taxId,
        });
        return {
          status: "CREATED",
          ...persisted,
          auditIntent: {
            action: "ORGANIZATION_CREATED",
            targetType: "CustomerAccount",
            targetId: persisted.account.id,
          },
        };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}

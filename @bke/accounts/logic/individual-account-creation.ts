import type {
  AccountsIndividualAccountCreationCapability,
  AccountsIndividualAccountCreationInput,
  AccountsIndividualAccountCreationResult,
} from "../contracts/individual-account-creation.contract";
import type { AccountsIdProvider } from "./accounts-id-provider";
import type { AccountsIndividualAccountCreationRepository } from "./individual-account-creation-repository";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createAccountsIndividualAccountCreationCapability(
  repository: AccountsIndividualAccountCreationRepository,
  idProvider: AccountsIdProvider,
): AccountsIndividualAccountCreationCapability {
  return Object.freeze({
    async create(
      input: AccountsIndividualAccountCreationInput,
    ): Promise<AccountsIndividualAccountCreationResult> {
      const ownerId = input.ownerId.trim();
      const displayName = input.displayName.trim();
      const billingEmail = input.billingEmail.trim().toLowerCase();

      if (
        !ownerId ||
        ownerId.length > 256 ||
        displayName.length < 2 ||
        displayName.length > 100 ||
        billingEmail.length > 254 ||
        !EMAIL_PATTERN.test(billingEmail)
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
        const account = await repository.createIndividualAccount({
          id: accountId,
          ownerId,
          displayName,
          billingEmail,
        });
        return { status: "CREATED", account };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}

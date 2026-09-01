import type {
  AccountsSwitchableAccountListCapability,
  AccountsSwitchableAccountListInput,
  AccountsSwitchableAccountListResult,
} from "../contracts/switchable-account-list.contract";
import type { AccountsSwitchableAccountListRepository } from "./switchable-account-list-repository";

export function createAccountsSwitchableAccountListCapability(
  repository: AccountsSwitchableAccountListRepository,
): AccountsSwitchableAccountListCapability {
  return Object.freeze({
    async list(input: AccountsSwitchableAccountListInput): Promise<AccountsSwitchableAccountListResult> {
      const principalId = input.principalId.trim();
      if (!principalId || principalId.length > 256) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      let records;
      try {
        records = await repository.listSwitchable(principalId);
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }

      return {
        status: "LISTED",
        accounts: records.map((record) => ({
          id: record.account.id,
          type: record.account.type,
          displayName: record.account.displayName,
          lifecycleState: "ACTIVE" as const,
          effectiveRole:
            record.account.ownerId === principalId
              ? "OWNER"
              : record.membershipRole ?? "MEMBER",
        })),
      };
    },
  });
}

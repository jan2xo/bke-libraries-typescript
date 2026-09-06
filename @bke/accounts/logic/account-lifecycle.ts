import type {
  AccountsAccountLifecycleCapability,
  AccountsAccountLifecycleResult,
} from "../contracts/account-lifecycle.contract";
import type { AccountsAccountLifecycleRepository } from "./account-lifecycle-repository";

export function createAccountsAccountLifecycleCapability(
  repository: AccountsAccountLifecycleRepository,
): AccountsAccountLifecycleCapability {
  return Object.freeze({
    async findByAccountId(accountId: string): Promise<AccountsAccountLifecycleResult> {
      const normalizedAccountId = accountId.trim();
      if (!normalizedAccountId || normalizedAccountId.length > 256) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      try {
        const value = await repository.findLifecycle(normalizedAccountId);
        if (!value) return { status: "NOT_FOUND" };
        return { status: "FOUND", value: Object.freeze(value) };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}

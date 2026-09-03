import type { AccountsAccountAccessCapability } from "../contracts/account-access.contract";
import type {
  AccountsPurchaseAccessCapability,
  AccountsPurchaseAccessInput,
  AccountsPurchaseAccessResult,
} from "../contracts/purchase-access.contract";

export function createAccountsPurchaseAccessCapability(
  accountAccess: AccountsAccountAccessCapability,
): AccountsPurchaseAccessCapability {
  return Object.freeze({
    async authorize(input: AccountsPurchaseAccessInput): Promise<AccountsPurchaseAccessResult> {
      const access = await accountAccess.authorize({
        principalId: input.principalId,
        accountId: input.accountId,
        requiredCapability: "PURCHASE",
      });
      if (access.status !== "AUTHORIZED") return access;
      if (access.account.lifecycleState !== "ACTIVE") {
        return { status: "REJECTED", code: "ACCOUNT_NOT_ACTIVE" };
      }
      return access;
    },
  });
}

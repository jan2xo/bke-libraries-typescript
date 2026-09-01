import type { AccountsCapability } from "../contracts/account-access.contract";
import type { AccountsMemberRole } from "../contracts/account.contract";

const capabilityMatrix: Readonly<Record<AccountsMemberRole, ReadonlySet<AccountsCapability>>> = {
  OWNER: new Set<AccountsCapability>([
    "VIEW_ORDERS",
    "VIEW_INVOICES",
    "VIEW_PAYMENTS",
    "PURCHASE",
    "RENEW",
    "CANCEL_PENDING_ORDER",
    "VIEW_SUBSCRIPTIONS",
    "VIEW_LICENSES",
    "REVEAL_LICENSE",
    "ASSIGN_LICENSE",
    "DEACTIVATE_DEVICE",
    "DOWNLOAD_INSTALLER",
    "START_TRIAL",
    "MANAGE_MEMBERS",
    "CLOSE_ACCOUNT",
  ]),
  BILLING: new Set<AccountsCapability>([
    "VIEW_ORDERS",
    "VIEW_INVOICES",
    "VIEW_PAYMENTS",
    "PURCHASE",
    "RENEW",
    "CANCEL_PENDING_ORDER",
    "VIEW_SUBSCRIPTIONS",
    "START_TRIAL",
  ]),
  LICENSE_MANAGER: new Set<AccountsCapability>([
    "VIEW_SUBSCRIPTIONS",
    "VIEW_LICENSES",
    "REVEAL_LICENSE",
    "ASSIGN_LICENSE",
    "DEACTIVATE_DEVICE",
    "DOWNLOAD_INSTALLER",
  ]),
  MEMBER: new Set<AccountsCapability>(),
};

export function roleHasAccountsCapability(
  role: AccountsMemberRole,
  capability: AccountsCapability,
): boolean {
  return capabilityMatrix[role].has(capability);
}

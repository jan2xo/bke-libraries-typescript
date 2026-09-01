import type { AccountsAccountSnapshot } from "./account.contract";

export const ACCOUNTS_ORGANIZATION_CLOSE_CAPABILITY_ID =
  "bke.accounts.organization-close.v1" as const;

export interface AccountsOrganizationCloseInput {
  readonly actorPrincipalId: string;
  readonly accountId: string;
}

export interface AccountsClosedOrganizationSnapshot
  extends Omit<AccountsAccountSnapshot, "type" | "lifecycleState"> {
  readonly type: "ORGANIZATION";
  readonly lifecycleState: "CLOSED";
  readonly closureRequestedAt: Date;
  readonly closedAt: Date;
}

export type AccountsOrganizationCloseResult =
  | {
      readonly status: "CLOSED";
      readonly account: AccountsClosedOrganizationSnapshot;
      readonly auditIntent: {
        readonly action: "ORGANIZATION_CLOSED";
        readonly accountId: string;
        readonly targetType: "CustomerAccount";
        readonly targetId: string;
      };
    }
  | {
      readonly status: "REJECTED";
      readonly code:
        | "NOT_FOUND"
        | "ACCOUNT_ROLE_FORBIDDEN"
        | "ACCOUNT_NOT_ORGANIZATION";
    }
  | {
      readonly status: "FAILED";
      readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE";
    };

export interface AccountsOrganizationCloseCapability {
  close(input: AccountsOrganizationCloseInput): Promise<AccountsOrganizationCloseResult>;
}

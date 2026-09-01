import { Client } from "pg";
import type {
  AccountsAccountSnapshot,
  AccountsMemberRole,
} from "../../contracts/account.contract";
import type { AccountsOwnershipTransferMembershipSnapshot } from "../../contracts/ownership-transfer.contract";
import type {
  AccountsOwnershipTransferRepository,
  AccountsOwnershipTransferRepositoryInput,
  AccountsOwnershipTransferRepositoryResult,
} from "../../logic/ownership-transfer-repository";

interface AccountRow extends AccountsAccountSnapshot {}

interface MembershipRow extends AccountsOwnershipTransferMembershipSnapshot {}

export function createPostgresAccountsOwnershipTransferRepository(
  connectionString: string,
): AccountsOwnershipTransferRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Accounts PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async transfer(
      input: AccountsOwnershipTransferRepositoryInput,
    ): Promise<AccountsOwnershipTransferRepositoryResult> {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        await client.query("BEGIN");

        const accountResult = await client.query<AccountRow>(
          `SELECT "id", "type", "displayName", "ownerId", "billingEmail", "taxId", "lifecycleState"
             FROM "CustomerAccount"
            WHERE "id" = $1
            FOR UPDATE`,
          [input.accountId],
        );
        const account = accountResult.rows[0];
        if (!account) {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "NOT_FOUND" };
        }
        if (account.type !== "ORGANIZATION") {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "ACCOUNT_NOT_ORGANIZATION" };
        }
        if (
          account.lifecycleState === "CLOSED" ||
          account.lifecycleState === "CLOSURE_REQUESTED"
        ) {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "CLOSED_ACCOUNT" };
        }
        if (account.lifecycleState === "SUSPENDED") {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "SUSPENDED_ACCOUNT" };
        }

        const targetResult = await client.query<MembershipRow>(
          `SELECT "accountId", "userId", "role", "createdAt"
             FROM "Membership"
            WHERE "accountId" = $1 AND "userId" = $2
            FOR UPDATE`,
          [input.accountId, input.newOwnerPrincipalId],
        );
        const target = targetResult.rows[0];
        if (!target || input.newOwnerPrincipalId === account.ownerId) {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "MEMBER_NOT_FOUND" };
        }

        const previousNewOwnerRole: AccountsMemberRole = target.role;
        const previousOwnerPrincipalId = account.ownerId;

        const promotedResult = await client.query<MembershipRow>(
          `UPDATE "Membership"
              SET "role" = 'OWNER'
            WHERE "accountId" = $1 AND "userId" = $2
            RETURNING "accountId", "userId", "role", "createdAt"`,
          [input.accountId, input.newOwnerPrincipalId],
        );
        const promoted = promotedResult.rows[0];
        if (!promoted) {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "MEMBER_NOT_FOUND" };
        }

        const updatedAccountResult = await client.query<AccountRow>(
          `UPDATE "CustomerAccount"
              SET "ownerId" = $2
            WHERE "id" = $1
            RETURNING "id", "type", "displayName", "ownerId", "billingEmail", "taxId", "lifecycleState"`,
          [input.accountId, input.newOwnerPrincipalId],
        );
        const updatedAccount = updatedAccountResult.rows[0];
        if (!updatedAccount || updatedAccount.type !== "ORGANIZATION") {
          throw new Error("Accounts ownership transfer lost the organization account during update.");
        }

        const demotedResult = await client.query<MembershipRow>(
          `UPDATE "Membership"
              SET "role" = 'BILLING'
            WHERE "accountId" = $1
              AND "userId" = $2
              AND "role" = 'OWNER'
            RETURNING "accountId", "userId", "role", "createdAt"`,
          [input.accountId, previousOwnerPrincipalId],
        );

        await client.query("COMMIT");
        return {
          status: "TRANSFERRED",
          account: { ...updatedAccount, type: "ORGANIZATION" },
          newOwnerMembership: promoted,
          previousOwnerPrincipalId,
          previousNewOwnerRole,
          previousOwnerMembershipDemoted: demotedResult.rowCount === 1,
        };
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Preserve the original persistence failure.
        }
        throw error;
      } finally {
        await client.end();
      }
    },
  });
}

import { Client } from "pg";
import type { AccountsLifecycleState } from "../../contracts/account.contract";
import type {
  AccountsOrganizationCloseRepository,
  AccountsOrganizationCloseRepositoryInput,
  AccountsOrganizationCloseRepositoryResult,
} from "../../logic/organization-close-repository";

interface AccountRow {
  id: string;
  type: "INDIVIDUAL" | "ORGANIZATION";
  displayName: string;
  ownerId: string;
  billingEmail: string;
  taxId: string | null;
  lifecycleState: AccountsLifecycleState;
  closureRequestedAt: Date | null;
  closedAt: Date | null;
}

export function createPostgresAccountsOrganizationCloseRepository(
  connectionString: string,
): AccountsOrganizationCloseRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Accounts PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async close(
      input: AccountsOrganizationCloseRepositoryInput,
    ): Promise<AccountsOrganizationCloseRepositoryResult> {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        await client.query("BEGIN");

        const currentResult = await client.query<Pick<AccountRow, "id" | "type">>(
          `SELECT "id", "type"
             FROM "CustomerAccount"
            WHERE "id" = $1
            FOR UPDATE`,
          [input.accountId],
        );
        const current = currentResult.rows[0];
        if (!current) {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "NOT_FOUND" };
        }
        if (current.type !== "ORGANIZATION") {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "ACCOUNT_NOT_ORGANIZATION" };
        }

        const updatedResult = await client.query<AccountRow>(
          `UPDATE "CustomerAccount"
              SET "lifecycleState" = 'CLOSED',
                  "closureRequestedAt" = $2,
                  "closedAt" = $2,
                  "updatedAt" = $2
            WHERE "id" = $1
            RETURNING "id", "type", "displayName", "ownerId", "billingEmail", "taxId",
                      "lifecycleState", "closureRequestedAt", "closedAt"`,
          [input.accountId, input.closedAt],
        );
        const updated = updatedResult.rows[0];
        if (!updated || updated.type !== "ORGANIZATION" || updated.lifecycleState !== "CLOSED") {
          throw new Error("Accounts organization close returned invalid aggregate state.");
        }
        if (!updated.closureRequestedAt || !updated.closedAt) {
          throw new Error("Accounts organization close did not persist closure timestamps.");
        }

        await client.query("COMMIT");
        return {
          status: "CLOSED",
          account: {
            id: updated.id,
            type: "ORGANIZATION",
            displayName: updated.displayName,
            ownerId: updated.ownerId,
            billingEmail: updated.billingEmail,
            taxId: updated.taxId,
            lifecycleState: "CLOSED",
            closureRequestedAt: updated.closureRequestedAt,
            closedAt: updated.closedAt,
          },
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

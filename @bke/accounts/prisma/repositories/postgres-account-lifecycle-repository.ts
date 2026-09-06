import { Client } from "pg";
import type { AccountsLifecycleState } from "../../contracts/account.contract";
import type { AccountsAccountLifecycleRepository } from "../../logic/account-lifecycle-repository";

interface AccountLifecycleRow {
  accountId: string;
  lifecycleState: AccountsLifecycleState;
}

export function createPostgresAccountsAccountLifecycleRepository(
  connectionString: string,
): AccountsAccountLifecycleRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Accounts PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async findLifecycle(accountId: string) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        const result = await client.query<AccountLifecycleRow>(
          `SELECT "id" AS "accountId", "lifecycleState"
             FROM "CustomerAccount"
            WHERE "id" = $1
            LIMIT 1`,
          [accountId],
        );
        const row = result.rows[0];
        if (!row) return null;
        return Object.freeze({
          accountId: row.accountId,
          lifecycleState: row.lifecycleState,
        });
      } finally {
        await client.end();
      }
    },
  });
}

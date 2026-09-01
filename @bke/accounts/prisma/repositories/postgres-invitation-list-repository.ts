import { Client } from "pg";
import type { AccountsInvitationListItem } from "../../contracts/invitation-list.contract";
import type { AccountsInvitationListRepository } from "../../logic/invitation-list-repository";

export function createPostgresAccountsInvitationListRepository(
  connectionString: string,
): AccountsInvitationListRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Accounts PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async listByAccountId(accountId: string): Promise<readonly AccountsInvitationListItem[]> {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        const result = await client.query<AccountsInvitationListItem>(
          `SELECT "id", "accountId", "email", "role", "status", "expiresAt", "createdAt"
             FROM "Invitation"
            WHERE "accountId" = $1
            ORDER BY "createdAt" DESC`,
          [accountId],
        );
        return result.rows;
      } finally {
        await client.end();
      }
    },
  });
}

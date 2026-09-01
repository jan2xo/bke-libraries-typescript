import { Client } from "pg";
import type { AccountsExpiredInvitation } from "../../contracts/invitation-expiration.contract";
import type { AccountsInvitationExpirationRepository } from "../../logic/invitation-expiration-repository";

export function createPostgresAccountsInvitationExpirationRepository(
  connectionString: string,
): AccountsInvitationExpirationRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Accounts PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async expirePendingAt(now: Date): Promise<readonly AccountsExpiredInvitation[]> {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        const result = await client.query<AccountsExpiredInvitation>(
          `UPDATE "Invitation"
              SET "status" = 'EXPIRED'
            WHERE "status" = 'PENDING'
              AND "expiresAt" <= $1
            RETURNING "id", "accountId"`,
          [now],
        );
        return result.rows;
      } finally {
        await client.end();
      }
    },
  });
}

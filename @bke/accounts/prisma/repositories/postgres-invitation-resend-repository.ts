import { Client } from "pg";
import type { AccountsInvitationSnapshot } from "../../contracts/invitation-issuance.contract";
import type {
  AccountsInvitationResendExisting,
  AccountsInvitationResendRepository,
  AccountsInvitationResendUpdate,
} from "../../logic/invitation-resend-repository";

export function createPostgresAccountsInvitationResendRepository(
  connectionString: string,
): AccountsInvitationResendRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Accounts PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async findInvitation(invitationId: string): Promise<AccountsInvitationResendExisting | null> {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        const result = await client.query<AccountsInvitationResendExisting>(
          `SELECT "id", "accountId", "status" FROM "Invitation" WHERE "id" = $1`,
          [invitationId],
        );
        return result.rows[0] ?? null;
      } finally {
        await client.end();
      }
    },

    async updatePendingInvitation(
      update: AccountsInvitationResendUpdate,
    ): Promise<AccountsInvitationSnapshot | null> {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        const result = await client.query<AccountsInvitationSnapshot>(
          `UPDATE "Invitation"
              SET "tokenHash" = $2, "expiresAt" = $3
            WHERE "id" = $1 AND "status" = 'PENDING'
            RETURNING "id", "accountId", "email", "role", "status", "expiresAt", "createdAt"`,
          [update.id, update.tokenHash, update.expiresAt],
        );
        return result.rows[0] ?? null;
      } finally {
        await client.end();
      }
    },
  });
}

import { Client } from "pg";
import type { AccountsRevokedInvitationSnapshot } from "../../contracts/invitation-revocation.contract";
import type {
  AccountsInvitationRevocationExisting,
  AccountsInvitationRevocationRepository,
} from "../../logic/invitation-revocation-repository";

export function createPostgresAccountsInvitationRevocationRepository(
  connectionString: string,
): AccountsInvitationRevocationRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Accounts PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async findInvitation(
      invitationId: string,
    ): Promise<AccountsInvitationRevocationExisting | null> {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        const result = await client.query<AccountsInvitationRevocationExisting>(
          `SELECT "id", "accountId", "status" FROM "Invitation" WHERE "id" = $1`,
          [invitationId],
        );
        return result.rows[0] ?? null;
      } finally {
        await client.end();
      }
    },

    async revokePendingInvitation(
      invitationId: string,
    ): Promise<AccountsRevokedInvitationSnapshot | null> {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        const result = await client.query<AccountsRevokedInvitationSnapshot>(
          `UPDATE "Invitation"
              SET "status" = 'REVOKED'
            WHERE "id" = $1 AND "status" = 'PENDING'
            RETURNING "id", "accountId", "email", "role", "status", "expiresAt", "createdAt"`,
          [invitationId],
        );
        return result.rows[0] ?? null;
      } finally {
        await client.end();
      }
    },
  });
}

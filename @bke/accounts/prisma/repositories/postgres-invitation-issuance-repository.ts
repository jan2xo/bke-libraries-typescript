import { Client } from "pg";
import type { AccountsInvitationSnapshot } from "../../contracts/invitation-issuance.contract";
import type {
  AccountsInvitationIssuanceRecord,
  AccountsInvitationIssuanceRepository,
} from "../../logic/invitation-issuance-repository";

export function createPostgresAccountsInvitationIssuanceRepository(
  connectionString: string,
): AccountsInvitationIssuanceRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Accounts PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async createInvitation(
      record: AccountsInvitationIssuanceRecord,
    ): Promise<AccountsInvitationSnapshot> {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        const result = await client.query<AccountsInvitationSnapshot>(
          `INSERT INTO "Invitation"
             ("id", "accountId", "email", "role", "tokenHash", "status", "expiresAt")
           VALUES ($1, $2, $3, $4, $5, 'PENDING', $6)
           RETURNING "id", "accountId", "email", "role", "status", "expiresAt", "createdAt"`,
          [
            record.id,
            record.accountId,
            record.email,
            record.role,
            record.tokenHash,
            record.expiresAt,
          ],
        );
        const invitation = result.rows[0];
        if (!invitation) {
          throw new Error("Accounts invitation creation returned no row.");
        }
        return invitation;
      } finally {
        await client.end();
      }
    },
  });
}

import { Client } from "pg";
import type { AccountsMemberRole } from "../../contracts/account.contract";
import type {
  AccountsAccountAccessRecord,
  AccountsAccountAccessRepository,
} from "../../logic/account-access-repository";

interface AccountAccessRow {
  id: string;
  type: "INDIVIDUAL" | "ORGANIZATION";
  displayName: string;
  ownerId: string;
  billingEmail: string;
  taxId: string | null;
  lifecycleState:
    | "ACTIVE"
    | "SUSPENDED"
    | "CLOSURE_REQUESTED"
    | "CLOSED"
    | "PRIVACY_REVIEW"
    | "PSEUDONYMIZED"
    | "PURGE_ELIGIBLE";
  membershipRole: AccountsMemberRole | null;
}

export function createPostgresAccountsAccountAccessRepository(
  connectionString: string,
): AccountsAccountAccessRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Accounts PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async findAccess(principalId: string, accountId: string): Promise<AccountsAccountAccessRecord | null> {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        const result = await client.query<AccountAccessRow>(
          `SELECT a."id", a."type", a."displayName", a."ownerId", a."billingEmail",
                  a."taxId", a."lifecycleState", m."role" AS "membershipRole"
             FROM "CustomerAccount" a
             LEFT JOIN "Membership" m
               ON m."accountId" = a."id"
              AND m."userId" = $1
            WHERE a."id" = $2
              AND (a."ownerId" = $1 OR m."userId" IS NOT NULL)
            LIMIT 1`,
          [principalId, accountId],
        );
        const row = result.rows[0];
        if (!row) return null;
        return {
          account: {
            id: row.id,
            type: row.type,
            displayName: row.displayName,
            ownerId: row.ownerId,
            billingEmail: row.billingEmail,
            taxId: row.taxId,
            lifecycleState: row.lifecycleState,
          },
          membershipRole: row.membershipRole,
        };
      } finally {
        await client.end();
      }
    },
  });
}

import { Client } from "pg";
import type { AccountsMemberRole } from "../../contracts/account.contract";
import type {
  AccountsSwitchableAccountListRepository,
  AccountsSwitchableAccountRecord,
} from "../../logic/switchable-account-list-repository";

interface SwitchableAccountRow {
  id: string;
  type: "INDIVIDUAL" | "ORGANIZATION";
  displayName: string;
  ownerId: string;
  lifecycleState: "ACTIVE";
  membershipRole: AccountsMemberRole | null;
}

export function createPostgresAccountsSwitchableAccountListRepository(
  connectionString: string,
): AccountsSwitchableAccountListRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Accounts PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async listSwitchable(principalId: string): Promise<readonly AccountsSwitchableAccountRecord[]> {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        const result = await client.query<SwitchableAccountRow>(
          `SELECT a."id", a."type", a."displayName", a."ownerId", a."lifecycleState",
                  m."role" AS "membershipRole"
             FROM "CustomerAccount" a
             LEFT JOIN "Membership" m
               ON m."accountId" = a."id"
              AND m."userId" = $1
            WHERE a."lifecycleState" = 'ACTIVE'
              AND (a."ownerId" = $1 OR m."userId" IS NOT NULL)
            ORDER BY a."type" ASC, a."createdAt" ASC`,
          [principalId],
        );
        return result.rows.map((row) => ({
          account: {
            id: row.id,
            type: row.type,
            displayName: row.displayName,
            ownerId: row.ownerId,
            lifecycleState: row.lifecycleState,
          },
          membershipRole: row.membershipRole,
        }));
      } finally {
        await client.end();
      }
    },
  });
}

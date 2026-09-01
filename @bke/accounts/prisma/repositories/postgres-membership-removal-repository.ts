import { Client } from "pg";
import type { AccountsMemberRole } from "../../contracts/account.contract";
import type {
  AccountsMembershipRemovalRepository,
  AccountsMembershipRemovalRepositoryInput,
  AccountsMembershipRemovalRepositoryResult,
} from "../../logic/membership-removal-repository";

interface MembershipRow {
  accountId: string;
  userId: string;
  role: AccountsMemberRole;
  createdAt: Date;
}

export function createPostgresAccountsMembershipRemovalRepository(
  connectionString: string,
): AccountsMembershipRemovalRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Accounts PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async remove(
      input: AccountsMembershipRemovalRepositoryInput,
    ): Promise<AccountsMembershipRemovalRepositoryResult> {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        await client.query("BEGIN");
        await client.query(`SELECT "id" FROM "CustomerAccount" WHERE "id" = $1 FOR UPDATE`, [
          input.accountId,
        ]);

        const memberResult = await client.query<MembershipRow>(
          `SELECT "accountId", "userId", "role", "createdAt"
             FROM "Membership"
            WHERE "accountId" = $1 AND "userId" = $2`,
          [input.accountId, input.targetPrincipalId],
        );
        const member = memberResult.rows[0];
        if (!member) {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "MEMBER_NOT_FOUND" };
        }

        if (member.role === "OWNER") {
          const ownerCountResult = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS "count"
               FROM "Membership"
              WHERE "accountId" = $1 AND "role" = 'OWNER'`,
            [input.accountId],
          );
          const ownerCount = Number(ownerCountResult.rows[0]?.count ?? "0");
          if (ownerCount <= 1) {
            await client.query("ROLLBACK");
            return { status: "REJECTED", code: "LAST_OWNER_REQUIRED" };
          }
        }

        const removedResult = await client.query<MembershipRow>(
          `DELETE FROM "Membership"
            WHERE "accountId" = $1 AND "userId" = $2
            RETURNING "accountId", "userId", "role", "createdAt"`,
          [input.accountId, input.targetPrincipalId],
        );
        const removed = removedResult.rows[0];
        if (!removed) {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "MEMBER_NOT_FOUND" };
        }

        await client.query("COMMIT");
        return { status: "REMOVED", membership: removed };
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

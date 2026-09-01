import { Client } from "pg";
import type { AccountsMemberRole } from "../../contracts/account.contract";
import type {
  AccountsMemberLeaveRepository,
  AccountsMemberLeaveRepositoryInput,
  AccountsMemberLeaveRepositoryResult,
} from "../../logic/member-leave-repository";

interface AccountOwnerRow {
  ownerId: string;
}

interface MembershipRow {
  accountId: string;
  userId: string;
  role: AccountsMemberRole;
  createdAt: Date;
}

export function createPostgresAccountsMemberLeaveRepository(
  connectionString: string,
): AccountsMemberLeaveRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Accounts PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async leave(input: AccountsMemberLeaveRepositoryInput): Promise<AccountsMemberLeaveRepositoryResult> {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        await client.query("BEGIN");

        const accountResult = await client.query<AccountOwnerRow>(
          `SELECT "ownerId" FROM "CustomerAccount" WHERE "id" = $1 FOR UPDATE`,
          [input.accountId],
        );
        const account = accountResult.rows[0];
        if (!account) {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "MEMBER_NOT_FOUND" };
        }

        const memberResult = await client.query<MembershipRow>(
          `SELECT "accountId", "userId", "role", "createdAt"
             FROM "Membership"
            WHERE "accountId" = $1 AND "userId" = $2
            FOR UPDATE`,
          [input.accountId, input.principalId],
        );
        const member = memberResult.rows[0];
        if (!member) {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "MEMBER_NOT_FOUND" };
        }

        if (account.ownerId === input.principalId || member.role === "OWNER") {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "OWNER_CANNOT_LEAVE" };
        }

        const deletedResult = await client.query<MembershipRow>(
          `DELETE FROM "Membership"
            WHERE "accountId" = $1 AND "userId" = $2
            RETURNING "accountId", "userId", "role", "createdAt"`,
          [input.accountId, input.principalId],
        );
        const deleted = deletedResult.rows[0];
        if (!deleted) {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "MEMBER_NOT_FOUND" };
        }

        await client.query("COMMIT");
        return { status: "LEFT", membership: deleted };
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

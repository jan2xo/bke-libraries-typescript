import { Client } from "pg";
import type { AccountsMemberRole } from "../../contracts/account.contract";
import type {
  AccountsOrganizationDetailRepository,
  AccountsOrganizationDetailRepositoryInput,
  AccountsOrganizationDetailRepositoryResult,
} from "../../logic/organization-detail-repository";

export function createPostgresAccountsOrganizationDetailRepository(
  connectionString: string,
): AccountsOrganizationDetailRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Accounts PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async get(
      input: AccountsOrganizationDetailRepositoryInput,
    ): Promise<AccountsOrganizationDetailRepositoryResult> {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");

        const organizationResult = await client.query<{
          legalName: string;
          registrationNumber: string | null;
        }>(
          `SELECT o."legalName", o."registrationNumber"
             FROM "CustomerAccount" a
             JOIN "OrganizationProfile" o ON o."accountId" = a."id"
            WHERE a."id" = $1 AND a."type" = 'ORGANIZATION'`,
          [input.accountId],
        );
        const organization = organizationResult.rows[0];
        if (!organization) {
          const accountType = await client.query<{ type: "INDIVIDUAL" | "ORGANIZATION" }>(
            `SELECT "type" FROM "CustomerAccount" WHERE "id" = $1`,
            [input.accountId],
          );
          await client.query("ROLLBACK");
          const type = accountType.rows[0]?.type;
          if (!type) return { status: "REJECTED", code: "NOT_FOUND" };
          if (type !== "ORGANIZATION") {
            return { status: "REJECTED", code: "ACCOUNT_NOT_ORGANIZATION" };
          }
          throw new Error("Accounts organization detail found an organization without a profile.");
        }

        const memberships = input.includeMembers
          ? (
              await client.query<{ userId: string; role: AccountsMemberRole }>(
                `SELECT "userId", "role"
                   FROM "Membership"
                  WHERE "accountId" = $1
                  ORDER BY "createdAt" ASC, "userId" ASC`,
                [input.accountId],
              )
            ).rows.map((row) => ({ principalId: row.userId, role: row.role }))
          : [];

        const pendingInvitations = input.includePendingInvitations
          ? (
              await client.query<{
                id: string;
                email: string;
                role: AccountsMemberRole;
                status: "PENDING";
                expiresAt: Date;
                createdAt: Date;
              }>(
                `SELECT "id", "email", "role", "status", "expiresAt", "createdAt"
                   FROM "Invitation"
                  WHERE "accountId" = $1 AND "status" = 'PENDING'
                  ORDER BY "createdAt" DESC, "id" ASC`,
                [input.accountId],
              )
            ).rows
          : [];

        await client.query("COMMIT");
        return {
          status: "FOUND",
          organization,
          memberships,
          pendingInvitations,
        };
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Preserve the original read failure.
        }
        throw error;
      } finally {
        await client.end();
      }
    },
  });
}

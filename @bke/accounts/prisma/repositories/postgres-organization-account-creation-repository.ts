import { Client } from "pg";
import type {
  AccountsOrganizationAccountCreationRecord,
  AccountsOrganizationAccountCreationRepository,
} from "../../logic/organization-account-creation-repository";

export function createPostgresAccountsOrganizationAccountCreationRepository(
  connectionString: string,
): AccountsOrganizationAccountCreationRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Accounts PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async createOrganizationAccount(record: AccountsOrganizationAccountCreationRecord) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        await client.query("BEGIN");
        const accountResult = await client.query<{
          id: string;
          type: "ORGANIZATION";
          displayName: string;
          ownerId: string;
          billingEmail: string;
          taxId: string | null;
          lifecycleState: "ACTIVE";
        }>(
          `INSERT INTO "CustomerAccount"
             ("id", "type", "displayName", "ownerId", "billingEmail", "taxId", "lifecycleState")
           VALUES ($1, 'ORGANIZATION', $2, $3, $4, $5, 'ACTIVE')
           RETURNING "id", "type", "displayName", "ownerId", "billingEmail", "taxId", "lifecycleState"`,
          [
            record.id,
            record.displayName,
            record.ownerPrincipalId,
            record.billingEmail,
            record.taxId,
          ],
        );
        const organizationResult = await client.query<{
          accountId: string;
          legalName: string;
          registrationNumber: string | null;
        }>(
          `INSERT INTO "OrganizationProfile" ("accountId", "legalName", "registrationNumber")
           VALUES ($1, $2, $3)
           RETURNING "accountId", "legalName", "registrationNumber"`,
          [record.id, record.legalName, record.registrationNumber],
        );
        const membershipResult = await client.query<{
          accountId: string;
          userId: string;
          role: "OWNER";
        }>(
          `INSERT INTO "Membership" ("accountId", "userId", "role")
           VALUES ($1, $2, 'OWNER')
           RETURNING "accountId", "userId", "role"`,
          [record.id, record.ownerPrincipalId],
        );

        const account = accountResult.rows[0];
        const organization = organizationResult.rows[0];
        const ownerMembership = membershipResult.rows[0];
        if (!account || !organization || !ownerMembership) {
          throw new Error("Accounts organization creation returned incomplete persistence state.");
        }

        await client.query("COMMIT");
        return { account, organization, ownerMembership };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        await client.end();
      }
    },
  });
}

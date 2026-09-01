import { Client } from "pg";
import type {
  AccountsOrganizationProfileUpdateRecord,
  AccountsOrganizationProfileUpdateRepository,
} from "../../logic/organization-profile-update-repository";

export function createPostgresAccountsOrganizationProfileUpdateRepository(
  connectionString: string,
): AccountsOrganizationProfileUpdateRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Accounts PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async updateOrganizationProfile(record: AccountsOrganizationProfileUpdateRecord) {
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
          lifecycleState:
            | "ACTIVE"
            | "SUSPENDED"
            | "CLOSURE_REQUESTED"
            | "CLOSED"
            | "PRIVACY_REVIEW"
            | "PSEUDONYMIZED"
            | "PURGE_ELIGIBLE";
        }>(
          `UPDATE "CustomerAccount"
              SET "displayName" = CASE WHEN $2::boolean THEN $3 ELSE "displayName" END,
                  "billingEmail" = CASE WHEN $4::boolean THEN $5 ELSE "billingEmail" END,
                  "taxId" = CASE WHEN $6::boolean THEN $7 ELSE "taxId" END,
                  "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = $1 AND "type" = 'ORGANIZATION'
            RETURNING "id", "type", "displayName", "ownerId", "billingEmail", "taxId", "lifecycleState"`,
          [
            record.accountId,
            record.displayName !== undefined,
            record.displayName ?? null,
            record.billingEmail !== undefined,
            record.billingEmail ?? null,
            record.taxId !== undefined,
            record.taxId ?? null,
          ],
        );
        const organizationResult = await client.query<{
          accountId: string;
          legalName: string;
          registrationNumber: string | null;
        }>(
          `UPDATE "OrganizationProfile"
              SET "legalName" = CASE WHEN $2::boolean THEN $3 ELSE "legalName" END,
                  "registrationNumber" = CASE WHEN $4::boolean THEN $5 ELSE "registrationNumber" END
            WHERE "accountId" = $1
            RETURNING "accountId", "legalName", "registrationNumber"`,
          [
            record.accountId,
            record.legalName !== undefined,
            record.legalName ?? null,
            record.registrationNumber !== undefined,
            record.registrationNumber ?? null,
          ],
        );
        const account = accountResult.rows[0];
        const organization = organizationResult.rows[0];
        if (!account || !organization) {
          throw new Error("Accounts organization profile update found incomplete aggregate state.");
        }
        await client.query("COMMIT");
        return { account, organization };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        await client.end();
      }
    },
  });
}

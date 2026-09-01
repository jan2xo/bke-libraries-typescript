import { Client } from "pg";
import type { AccountsAccountSnapshot } from "../../contracts/account.contract";
import type {
  AccountsIndividualAccountCreationRecord,
  AccountsIndividualAccountCreationRepository,
} from "../../logic/individual-account-creation-repository";

export function createPostgresAccountsIndividualAccountCreationRepository(
  connectionString: string,
): AccountsIndividualAccountCreationRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Accounts PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async createIndividualAccount(record: AccountsIndividualAccountCreationRecord) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        const result = await client.query<AccountsAccountSnapshot & { type: "INDIVIDUAL" }>(
          `INSERT INTO "CustomerAccount"
             ("id", "type", "displayName", "ownerId", "billingEmail", "taxId", "lifecycleState")
           VALUES ($1, 'INDIVIDUAL', $2, $3, $4, NULL, 'ACTIVE')
           RETURNING "id", "type", "displayName", "ownerId", "billingEmail", "taxId", "lifecycleState"`,
          [record.id, record.displayName, record.ownerId, record.billingEmail],
        );
        const account = result.rows[0];
        if (!account) {
          throw new Error("Accounts individual account insert returned no row.");
        }
        return account;
      } finally {
        await client.end();
      }
    },
  });
}

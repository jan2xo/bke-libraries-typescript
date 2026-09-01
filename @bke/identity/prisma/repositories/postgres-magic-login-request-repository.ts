import { Client } from "pg";
import type {
  IdentityMagicLoginPrincipal,
  IdentityMagicLoginRequestRepository,
  IdentityMagicLoginTokenRecord,
} from "../../logic/magic-login-request-repository";

export function createPostgresIdentityMagicLoginRequestRepository(
  connectionString: string,
): IdentityMagicLoginRequestRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Identity PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async findEligibleCustomerByEmail(email: string) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        const result = await client.query<IdentityMagicLoginPrincipal>(
          `SELECT "email"
             FROM "User"
            WHERE "email" = $1
              AND "role" = 'CUSTOMER'
            LIMIT 1`,
          [email],
        );
        return result.rows[0] ?? null;
      } finally {
        await client.end();
      }
    },

    async replacePendingToken(record: IdentityMagicLoginTokenRecord) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `UPDATE "VerificationToken"
              SET "usedAt" = $1
            WHERE "identifier" = $2
              AND "purpose" = 'MAGIC_LOGIN'
              AND "usedAt" IS NULL`,
          [record.replacedAt, record.identifier],
        );
        await client.query(
          `INSERT INTO "VerificationToken"
             ("id", "identifier", "purpose", "tokenHash", "expiresAt")
           VALUES ($1, $2, 'MAGIC_LOGIN', $3, $4)`,
          [record.id, record.identifier, record.tokenHash, record.expiresAt],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        await client.end();
      }
    },
  });
}

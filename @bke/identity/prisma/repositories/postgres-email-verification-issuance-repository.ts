import { Client } from "pg";
import type {
  IdentityEmailVerificationIssuanceRepository,
  IdentityEmailVerificationPrincipal,
  IdentityEmailVerificationTokenRecord,
} from "../../logic/email-verification-issuance-repository";

export function createPostgresIdentityEmailVerificationIssuanceRepository(
  connectionString: string,
): IdentityEmailVerificationIssuanceRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Identity PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async findPrincipalById(userId: string) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        const result = await client.query<IdentityEmailVerificationPrincipal>(
          `SELECT "id", "email", "emailVerified"
             FROM "User"
            WHERE "id" = $1
            LIMIT 1`,
          [userId],
        );
        return result.rows[0] ?? null;
      } finally {
        await client.end();
      }
    },

    async replacePendingToken(record: IdentityEmailVerificationTokenRecord) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `DELETE FROM "VerificationToken"
            WHERE "identifier" = $1
              AND "purpose" = 'VERIFY_EMAIL'
              AND "usedAt" IS NULL`,
          [record.identifier],
        );
        await client.query(
          `INSERT INTO "VerificationToken"
             ("id", "identifier", "purpose", "tokenHash", "expiresAt")
           VALUES ($1, $2, 'VERIFY_EMAIL', $3, $4)`,
          [record.id, record.identifier, record.tokenHash, record.expiresAt],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        await client.end();
      }
    },
  });
}

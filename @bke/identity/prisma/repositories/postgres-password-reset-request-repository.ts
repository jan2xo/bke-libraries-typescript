import { Client } from "pg";
import type {
  IdentityPasswordResetPrincipal,
  IdentityPasswordResetRequestRepository,
  IdentityPasswordResetTokenRecord,
} from "../../logic/password-reset-request-repository";

export function createPostgresIdentityPasswordResetRequestRepository(
  connectionString: string,
): IdentityPasswordResetRequestRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Identity PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async findPrincipalByEmail(email: string) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        const result = await client.query<IdentityPasswordResetPrincipal>(
          `SELECT "id", "email"
             FROM "User"
            WHERE "email" = $1
            LIMIT 1`,
          [email],
        );
        return result.rows[0] ?? null;
      } finally {
        await client.end();
      }
    },

    async createToken(record: IdentityPasswordResetTokenRecord) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        await client.query(
          `INSERT INTO "PasswordResetToken"
             ("id", "userId", "tokenHash", "expiresAt")
           VALUES ($1, $2, $3, $4)`,
          [record.id, record.userId, record.tokenHash, record.expiresAt],
        );
      } finally {
        await client.end();
      }
    },
  });
}

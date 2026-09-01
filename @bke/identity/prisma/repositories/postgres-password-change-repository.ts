import { Client } from "pg";
import type {
  IdentityPasswordChangeCommitInput,
  IdentityPasswordChangeCredential,
  IdentityPasswordChangeRepository,
} from "../../logic/password-change-repository";

export function createPostgresIdentityPasswordChangeRepository(
  connectionString: string,
): IdentityPasswordChangeRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Identity PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async findCredentialByUserId(userId: string) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        const result = await client.query<IdentityPasswordChangeCredential>(
          `SELECT "passwordHash"
             FROM "PasswordCredential"
            WHERE "userId" = $1
            LIMIT 1`,
          [userId],
        );
        return result.rows[0] ?? null;
      } finally {
        await client.end();
      }
    },

    async changePassword(input: IdentityPasswordChangeCommitInput) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        await client.query("BEGIN");

        const changed = await client.query(
          `UPDATE "PasswordCredential"
              SET "passwordHash" = $2,
                  "changedAt" = $3
            WHERE "userId" = $1
          RETURNING "userId"`,
          [input.userId, input.passwordHash, input.changedAt],
        );
        if (changed.rowCount !== 1) {
          throw new Error("Identity password credential disappeared before commit.");
        }

        await client.query(
          `UPDATE "Session"
              SET "revokedAt" = $2,
                  "revocationReason" = 'PASSWORD_CHANGED'
            WHERE "userId" = $1
              AND "revokedAt" IS NULL`,
          [input.userId, input.changedAt],
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

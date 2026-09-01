import { Client } from "pg";
import type {
  IdentityPasswordResetCommitInput,
  IdentityPasswordResetCommitResult,
  IdentityPasswordResetCompletionRecord,
  IdentityPasswordResetCompletionRepository,
} from "../../logic/password-reset-completion-repository";

export function createPostgresIdentityPasswordResetCompletionRepository(
  connectionString: string,
): IdentityPasswordResetCompletionRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Identity PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async findTokenByHash(tokenHash: string) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        const result = await client.query<IdentityPasswordResetCompletionRecord>(
          `SELECT
             reset."id",
             reset."userId",
             reset."expiresAt",
             reset."usedAt",
             u."role"
           FROM "PasswordResetToken" reset
           INNER JOIN "User" u ON u."id" = reset."userId"
          WHERE reset."tokenHash" = $1
          LIMIT 1`,
          [tokenHash],
        );
        return result.rows[0] ?? null;
      } finally {
        await client.end();
      }
    },

    async complete(
      input: IdentityPasswordResetCommitInput,
    ): Promise<IdentityPasswordResetCommitResult> {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        await client.query("BEGIN");

        const consumed = await client.query(
          `UPDATE "PasswordResetToken"
              SET "usedAt" = $3
            WHERE "id" = $1
              AND "userId" = $2
              AND "usedAt" IS NULL
              AND "expiresAt" >= $3`,
          [input.tokenId, input.userId, input.completedAt],
        );
        if ((consumed.rowCount ?? 0) !== 1) {
          await client.query("ROLLBACK");
          return { status: "TOKEN_REJECTED" };
        }

        await client.query(
          `INSERT INTO "PasswordCredential" ("userId", "passwordHash", "changedAt")
           VALUES ($1, $2, $3)
           ON CONFLICT ("userId") DO UPDATE
             SET "passwordHash" = EXCLUDED."passwordHash",
                 "changedAt" = EXCLUDED."changedAt"`,
          [input.userId, input.passwordHash, input.completedAt],
        );

        await client.query(
          `UPDATE "Session"
              SET "revokedAt" = $2,
                  "revocationReason" = 'PASSWORD_RESET'
            WHERE "userId" = $1
              AND "revokedAt" IS NULL`,
          [input.userId, input.completedAt],
        );

        await client.query("COMMIT");
        return { status: "COMPLETED" };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        await client.end();
      }
    },
  });
}

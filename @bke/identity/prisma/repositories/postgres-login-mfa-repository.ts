import { Client } from "pg";
import type {
  IdentityLoginMfaChallengeRecord,
  IdentityLoginMfaRecoveryCodeRecord,
  IdentityLoginMfaRepository,
} from "../../logic/login-mfa-repository";

type ChallengeRow = IdentityLoginMfaChallengeRecord;

type RecoveryRow = IdentityLoginMfaRecoveryCodeRecord;

export function createPostgresIdentityLoginMfaRepository(
  connectionString: string,
): IdentityLoginMfaRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Identity PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async findChallengeByTokenHash(tokenHash: string) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        const result = await client.query<ChallengeRow>(
          `SELECT
             c."id",
             c."userId",
             c."purpose",
             c."codeHash",
             c."expiresAt",
             c."consumedAt",
             c."attemptCount",
             u."role" AS "userRole"
           FROM "MfaChallenge" c
           JOIN "User" u ON u."id" = c."userId"
          WHERE c."tokenHash" = $1
          LIMIT 1`,
          [tokenHash],
        );
        return result.rows[0] ?? null;
      } finally {
        await client.end();
      }
    },

    async findUnusedRecoveryCode(userId: string, codeHash: string) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        const result = await client.query<RecoveryRow>(
          `SELECT "id"
             FROM "AdministratorRecoveryCode"
            WHERE "userId" = $1
              AND "codeHash" = $2
              AND "usedAt" IS NULL
            LIMIT 1`,
          [userId, codeHash],
        );
        return result.rows[0] ?? null;
      } finally {
        await client.end();
      }
    },

    async incrementChallengeAttempt(challengeId: string) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        await client.query(
          `UPDATE "MfaChallenge"
              SET "attemptCount" = "attemptCount" + 1
            WHERE "id" = $1
              AND "consumedAt" IS NULL`,
          [challengeId],
        );
      } finally {
        await client.end();
      }
    },

    async consumeChallenge(
      challengeId: string,
      recoveryCodeId: string | null,
      consumedAt: Date,
    ) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        await client.query("BEGIN");
        const consumed = await client.query(
          `UPDATE "MfaChallenge"
              SET "consumedAt" = $2
            WHERE "id" = $1
              AND "consumedAt" IS NULL
              AND "attemptCount" < 5
              AND "expiresAt" > $2`,
          [challengeId, consumedAt],
        );
        if ((consumed.rowCount ?? 0) !== 1) {
          await client.query("ROLLBACK");
          return "CHALLENGE_REJECTED" as const;
        }

        if (recoveryCodeId) {
          const recovery = await client.query(
            `UPDATE "AdministratorRecoveryCode"
                SET "usedAt" = $2
              WHERE "id" = $1
                AND "usedAt" IS NULL`,
            [recoveryCodeId, consumedAt],
          );
          if ((recovery.rowCount ?? 0) !== 1) {
            await client.query("ROLLBACK");
            return "RECOVERY_REJECTED" as const;
          }
        }

        await client.query("COMMIT");
        return "CONSUMED" as const;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        await client.end();
      }
    },
  });
}

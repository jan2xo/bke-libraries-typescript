import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type {
  IdentityMfaEnrollmentChallengeRecord,
  IdentityMfaEnrollmentCompletionCommitInput,
  IdentityMfaEnrollmentCompletionRepository,
  IdentityMfaEnrollmentRecoveryCodeRecord,
} from "../../logic/mfa-enrollment-completion-repository";

type EnrollmentChallengeRow = IdentityMfaEnrollmentChallengeRecord;
type RecoveryCodeRow = IdentityMfaEnrollmentRecoveryCodeRecord;

export function createPostgresIdentityMfaEnrollmentCompletionRepository(
  connectionString: string,
): IdentityMfaEnrollmentCompletionRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Identity PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async findEnrollmentChallenge(userId: string, tokenHash: string) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        const result = await client.query<EnrollmentChallengeRow>(
          `SELECT
             c."id",
             c."userId",
             c."purpose",
             c."codeHash",
             c."expiresAt",
             c."consumedAt",
             c."attemptCount",
             u."role" AS "userRole",
             m."id" AS "mfaMethodId",
             m."enabledAt" AS "mfaEnabledAt",
             m."pendingExpiresAt"
           FROM "MfaChallenge" c
           JOIN "User" u ON u."id" = c."userId"
           LEFT JOIN "AdministratorMfaMethod" m ON m."userId" = c."userId"
          WHERE c."userId" = $1
            AND c."tokenHash" = $2
          LIMIT 1`,
          [userId, tokenHash],
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
        const result = await client.query<RecoveryCodeRow>(
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
              AND "consumedAt" IS NULL
              AND "attemptCount" < 5`,
          [challengeId],
        );
      } finally {
        await client.end();
      }
    },

    async completeEnrollment(input: IdentityMfaEnrollmentCompletionCommitInput) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();

      try {
        await client.query("BEGIN");

        const challenge = await client.query(
          `UPDATE "MfaChallenge"
              SET "consumedAt" = $3
            WHERE "id" = $1
              AND "userId" = $2
              AND "purpose" = 'ENROLLMENT'::"MfaChallengePurpose"
              AND "consumedAt" IS NULL
              AND "attemptCount" < 5
              AND "expiresAt" > $3`,
          [input.challengeId, input.userId, input.completedAt],
        );
        if ((challenge.rowCount ?? 0) !== 1) {
          await client.query("ROLLBACK");
          return "CHALLENGE_REJECTED" as const;
        }

        if (input.recoveryCodeId) {
          const recovery = await client.query(
            `UPDATE "AdministratorRecoveryCode"
                SET "usedAt" = $3
              WHERE "id" = $1
                AND "userId" = $2
                AND "usedAt" IS NULL`,
            [input.recoveryCodeId, input.userId, input.completedAt],
          );
          if ((recovery.rowCount ?? 0) !== 1) {
            await client.query("ROLLBACK");
            return "RECOVERY_REJECTED" as const;
          }
        }

        const method = await client.query(
          `UPDATE "AdministratorMfaMethod"
              SET "encryptedSecret" = NULL,
                  "enabledAt" = $2,
                  "verifiedAt" = $2,
                  "disabledAt" = NULL,
                  "pendingExpiresAt" = NULL,
                  "updatedAt" = $2
            WHERE "userId" = $1
              AND "enabledAt" IS NULL
              AND "pendingExpiresAt" IS NOT NULL
              AND "pendingExpiresAt" >= $2`,
          [input.userId, input.completedAt],
        );
        if ((method.rowCount ?? 0) !== 1) {
          await client.query("ROLLBACK");
          return "ENROLLMENT_REJECTED" as const;
        }

        await client.query(
          `DELETE FROM "AdministratorRecoveryCode" WHERE "userId" = $1`,
          [input.userId],
        );

        for (const hash of input.newRecoveryCodeHashes) {
          await client.query(
            `INSERT INTO "AdministratorRecoveryCode" ("id", "userId", "codeHash")
             VALUES ($1, $2, $3)`,
            [randomUUID(), input.userId, hash],
          );
        }

        await client.query(
          `UPDATE "Session"
              SET "revokedAt" = $2,
                  "revocationReason" = 'MFA_ENROLLED'
            WHERE "userId" = $1
              AND "revokedAt" IS NULL`,
          [input.userId, input.completedAt],
        );

        await client.query("COMMIT");
        return "COMPLETED" as const;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        await client.end();
      }
    },
  });
}

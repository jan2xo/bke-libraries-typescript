import { Client } from "pg";
import type {
  IdentityRecentAuthMfaCommitInput,
  IdentityRecentAuthChallengeRecord,
  IdentityRecentAuthCommitResult,
  IdentityRecentAuthCompletionRepository,
  IdentityRecentAuthPasswordOnlyCustomerCommitInput,
  IdentityRecentAuthPasswordRecord,
  IdentityRecentAuthRecoveryCodeRecord,
} from "../../logic/recent-auth-completion-repository";
import type {
  IdentityIssuedSession,
  IdentitySessionAssuranceLevel,
  IdentitySessionAuthenticationMethod,
} from "../../contracts/session.contract";

type SessionRow = {
  id: string;
  userId: string;
  expiresAt: Date;
  lastAuthenticatedAt: Date;
  mfaVerifiedAt: Date | null;
  recentAuthenticatedAt: Date | null;
  lastSeenAt: Date;
  absoluteExpiresAt: Date;
  authenticationMethod: IdentitySessionAuthenticationMethod;
  assuranceLevel: IdentitySessionAssuranceLevel;
  createdAt: Date;
};

function toIssuedSession(row: SessionRow): IdentityIssuedSession {
  return {
    id: row.id,
    userId: row.userId,
    expiresAt: row.expiresAt,
    lastAuthenticatedAt: row.lastAuthenticatedAt,
    mfaVerifiedAt: row.mfaVerifiedAt,
    recentAuthenticatedAt: row.recentAuthenticatedAt,
    lastSeenAt: row.lastSeenAt,
    absoluteExpiresAt: row.absoluteExpiresAt,
    authenticationMethod: row.authenticationMethod,
    assuranceLevel: row.assuranceLevel,
    createdAt: row.createdAt,
  };
}

const SESSION_RETURNING = `
  "id",
  "userId",
  "expiresAt",
  "lastAuthenticatedAt",
  "mfaVerifiedAt",
  "recentAuthenticatedAt",
  "lastSeenAt",
  "absoluteExpiresAt",
  "authenticationMethod",
  "assuranceLevel",
  "createdAt"`;

export function createPostgresIdentityRecentAuthCompletionRepository(
  connectionString: string,
): IdentityRecentAuthCompletionRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Identity PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async findPasswordRecord(userId: string) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        const result = await client.query<IdentityRecentAuthPasswordRecord>(
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

    async findRecentAuthChallenge(userId: string, tokenHash: string) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        const result = await client.query<IdentityRecentAuthChallengeRecord>(
          `SELECT
             "id",
             "userId",
             "purpose",
             "codeHash",
             "expiresAt",
             "consumedAt",
             "attemptCount",
             "sessionId",
             "primaryAuthenticationMethod"
           FROM "MfaChallenge"
          WHERE "userId" = $1
            AND "tokenHash" = $2
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
        const result = await client.query<IdentityRecentAuthRecoveryCodeRecord>(
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
              AND "purpose" = 'RECENT_AUTH'::"MfaChallengePurpose"
              AND "consumedAt" IS NULL`,
          [challengeId],
        );
      } finally {
        await client.end();
      }
    },

    async upgradePasswordOnlyCustomerSession(
      input: IdentityRecentAuthPasswordOnlyCustomerCommitInput,
    ): Promise<IdentityRecentAuthCommitResult> {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        const result = await client.query<SessionRow>(
          `UPDATE "Session" s
              SET "recentAuthenticatedAt" = $3,
                  "assuranceLevel" = 'RECENTLY_AUTHENTICATED'::"SessionAssuranceLevel"
            WHERE s."id" = $1
              AND s."userId" = $2
              AND s."revokedAt" IS NULL
              AND s."expiresAt" > $3
              AND s."absoluteExpiresAt" > $3
              AND EXISTS (
                SELECT 1 FROM "User" u
                 WHERE u."id" = s."userId"
                   AND u."role" = 'CUSTOMER'::"IdentityRole"
                   AND u."suspendedAt" IS NULL
                   AND u."lifecycleState" = 'ACTIVE'::"IdentityLifecycleState"
              )
              AND NOT EXISTS (
                SELECT 1 FROM "AdministratorMfaMethod" m
                 WHERE m."userId" = s."userId"
                   AND m."enabledAt" IS NOT NULL
              )
          RETURNING ${SESSION_RETURNING}`,
          [input.sessionId, input.userId, input.completedAt],
        );
        const row = result.rows[0];
        return row
          ? { status: "COMPLETED", session: toIssuedSession(row) }
          : { status: "SESSION_REJECTED" };
      } finally {
        await client.end();
      }
    },

    async completeMfaRecentAuth(
      input: IdentityRecentAuthMfaCommitInput,
    ): Promise<IdentityRecentAuthCommitResult> {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        await client.query("BEGIN");

        const challenge = await client.query(
          `UPDATE "MfaChallenge"
              SET "consumedAt" = $3
            WHERE "id" = $1
              AND "userId" = $2
              AND "purpose" = 'RECENT_AUTH'::"MfaChallengePurpose"
              AND "consumedAt" IS NULL
              AND "attemptCount" < 5
              AND "expiresAt" > $3
              AND "primaryAuthenticationMethod" = $5::"MfaChallengeAuthenticationMethod"
              AND (
                ("primaryAuthenticationMethod" = 'GOOGLE_OIDC'::"MfaChallengeAuthenticationMethod"
                  AND "sessionId" = $4)
                OR
                ("primaryAuthenticationMethod" = 'PASSWORD'::"MfaChallengeAuthenticationMethod"
                  AND "sessionId" IS NULL)
              )`,
          [
            input.challengeId,
            input.userId,
            input.completedAt,
            input.sessionId,
            input.authenticationMethod?.startsWith("GOOGLE_OIDC") ? "GOOGLE_OIDC" : "PASSWORD",
          ],
        );
        if ((challenge.rowCount ?? 0) !== 1) {
          await client.query("ROLLBACK");
          return { status: "CHALLENGE_REJECTED" };
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
            return { status: "RECOVERY_REJECTED" };
          }
        }

        const session = await client.query<SessionRow>(
          `UPDATE "Session" s
              SET "recentAuthenticatedAt" = $3,
                  "mfaVerifiedAt" = CASE
                    WHEN EXISTS (
                      SELECT 1 FROM "AdministratorMfaMethod" m
                       WHERE m."userId" = s."userId" AND m."enabledAt" IS NOT NULL
                    ) THEN $3
                    ELSE s."mfaVerifiedAt"
                  END,
                  "authenticationMethod" = $4::"SessionAuthenticationMethod",
                  "assuranceLevel" = 'RECENTLY_AUTHENTICATED'::"SessionAssuranceLevel"
            WHERE s."id" = $1
              AND s."userId" = $2
              AND s."revokedAt" IS NULL
              AND s."expiresAt" > $3
              AND s."absoluteExpiresAt" > $3
              AND EXISTS (
                SELECT 1 FROM "User" u
                 WHERE u."id" = s."userId"
                   AND u."suspendedAt" IS NULL
                   AND u."lifecycleState" = 'ACTIVE'::"IdentityLifecycleState"
              )
              AND (
                (
                  $4::"SessionAuthenticationMethod" IN (
                    'GOOGLE_OIDC'::"SessionAuthenticationMethod",
                    'GOOGLE_OIDC_EMAIL_OTP'::"SessionAuthenticationMethod",
                    'GOOGLE_OIDC_RECOVERY'::"SessionAuthenticationMethod"
                  )
                  AND s."authenticationMethod" IN (
                    'GOOGLE_OIDC'::"SessionAuthenticationMethod",
                    'GOOGLE_OIDC_EMAIL_OTP'::"SessionAuthenticationMethod",
                    'GOOGLE_OIDC_RECOVERY'::"SessionAuthenticationMethod"
                  )
                )
                OR (
                  $4::"SessionAuthenticationMethod" IN (
                    'PASSWORD'::"SessionAuthenticationMethod",
                    'PASSWORD_TOTP'::"SessionAuthenticationMethod",
                    'PASSWORD_EMAIL_OTP'::"SessionAuthenticationMethod",
                    'PASSWORD_RECOVERY'::"SessionAuthenticationMethod"
                  )
                  AND s."authenticationMethod" IN (
                    'PASSWORD'::"SessionAuthenticationMethod",
                    'PASSWORD_TOTP'::"SessionAuthenticationMethod",
                    'PASSWORD_EMAIL_OTP'::"SessionAuthenticationMethod",
                    'PASSWORD_RECOVERY'::"SessionAuthenticationMethod",
                    'MFA_ENROLLMENT'::"SessionAuthenticationMethod",
                    'MAGIC_LINK'::"SessionAuthenticationMethod"
                  )
                )
              )
              AND (
                (
                  s."mfaVerifiedAt" IS NOT NULL
                  AND EXISTS (
                    SELECT 1 FROM "AdministratorMfaMethod" m
                     WHERE m."userId" = s."userId"
                       AND m."enabledAt" IS NOT NULL
                  )
                )
                OR (
                  $4::"SessionAuthenticationMethod" =
                    'GOOGLE_OIDC_EMAIL_OTP'::"SessionAuthenticationMethod"
                  AND s."mfaVerifiedAt" IS NULL
                  AND s."authenticationMethod" IN (
                    'GOOGLE_OIDC'::"SessionAuthenticationMethod",
                    'GOOGLE_OIDC_EMAIL_OTP'::"SessionAuthenticationMethod",
                    'GOOGLE_OIDC_RECOVERY'::"SessionAuthenticationMethod"
                  )
                  AND EXISTS (
                    SELECT 1 FROM "User" customer
                     WHERE customer."id" = s."userId"
                       AND customer."emailVerified" IS NOT NULL
                       AND customer."lifecycleState" = 'ACTIVE'::"IdentityLifecycleState"
                       AND customer."suspendedAt" IS NULL
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM "AdministratorMfaMethod" enabled
                     WHERE enabled."userId" = s."userId"
                       AND enabled."enabledAt" IS NOT NULL
                  )
                )
              )
          RETURNING ${SESSION_RETURNING}`,
          [
            input.sessionId,
            input.userId,
            input.completedAt,
            input.authenticationMethod,
          ],
        );
        const row = session.rows[0];
        if (!row) {
          await client.query("ROLLBACK");
          return { status: "SESSION_REJECTED" };
        }

        await client.query("COMMIT");
        return { status: "COMPLETED", session: toIssuedSession(row) };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        await client.end();
      }
    },
  });
}

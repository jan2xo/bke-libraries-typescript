import { Client } from "pg";
import type {
  IdentityRecentAuthChallengePersistenceInput,
  IdentityRecentAuthChallengeRepository,
} from "../../logic/recent-auth-challenge-repository";

type PrincipalRow = {
  email: string;
  emailVerified: Date | null;
  role: "CUSTOMER" | "ADMIN";
  suspendedAt: Date | null;
  lifecycleState: string;
  mfaEnabled: boolean;
  mfaEnrollmentExists: boolean;
};
type AuthenticationMethodRow = {
  authenticationMethod: string;
};

const GOOGLE_METHODS = [
  "GOOGLE_OIDC",
  "GOOGLE_OIDC_EMAIL_OTP",
  "GOOGLE_OIDC_RECOVERY",
] as const;

export function createPostgresIdentityRecentAuthChallengeRepository(
  connectionString: string,
): IdentityRecentAuthChallengeRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Identity PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async replacePendingRecentAuthChallenge(
      input: IdentityRecentAuthChallengePersistenceInput,
    ) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();

      try {
        await client.query("BEGIN");
        const principal = await client.query<PrincipalRow>(
          `SELECT u."email", u."emailVerified", u."role", u."suspendedAt",
                  u."lifecycleState",
                  (m."enabledAt" IS NOT NULL) AS "mfaEnabled",
                  EXISTS (
                    SELECT 1 FROM "AdministratorMfaMethod" enrolled
                     WHERE enrolled."userId" = u."id"
                  ) AS "mfaEnrollmentExists"
             FROM "User" u
             LEFT JOIN "AdministratorMfaMethod" m ON m."userId" = u."id"
            WHERE u."id" = $1
            LIMIT 1`,
          [input.userId],
        );
        const user = principal.rows[0];
        if (!user) {
          await client.query("ROLLBACK");
          return { status: "PRINCIPAL_NOT_FOUND" as const };
        }
        if (user.suspendedAt || user.lifecycleState !== "ACTIVE") {
          await client.query("ROLLBACK");
          return { status: "FORBIDDEN" as const };
        }

        let primaryAuthenticationMethod: "PASSWORD" | "GOOGLE_OIDC" = "PASSWORD";
        if (input.sessionId) {
          const session = await client.query<AuthenticationMethodRow>(
            `SELECT "authenticationMethod"
               FROM "Session"
              WHERE "id" = $1
                AND "userId" = $2
                AND "revokedAt" IS NULL
                AND "expiresAt" > NOW()
                AND "absoluteExpiresAt" > NOW()
              LIMIT 1`,
            [input.sessionId, input.userId],
          );
          const method = session.rows[0]?.authenticationMethod;
          if (!method || !GOOGLE_METHODS.includes(method as (typeof GOOGLE_METHODS)[number])) {
            await client.query("ROLLBACK");
            return { status: "FORBIDDEN" as const };
          }
          primaryAuthenticationMethod = "GOOGLE_OIDC";
        }

        const mayUseUnenrolledGoogleOtp =
          primaryAuthenticationMethod === "GOOGLE_OIDC" &&
          user.emailVerified !== null;
        if (!user.mfaEnabled && (!mayUseUnenrolledGoogleOtp || user.mfaEnrollmentExists)) {
          await client.query("ROLLBACK");
          return { status: "FORBIDDEN" as const };
        }

        await client.query(
          `DELETE FROM "MfaChallenge"
            WHERE "userId" = $1
              AND "purpose" = 'RECENT_AUTH'::"MfaChallengePurpose"
              AND "primaryAuthenticationMethod" = $2::"MfaChallengeAuthenticationMethod"
              AND "sessionId" IS NOT DISTINCT FROM $3
              AND "consumedAt" IS NULL`,
          [input.userId, primaryAuthenticationMethod, input.sessionId ?? null],
        );

        await client.query(
          `INSERT INTO "MfaChallenge" (
             "id", "userId", "purpose", "primaryAuthenticationMethod",
             "sessionId", "tokenHash", "codeHash", "expiresAt"
           ) VALUES (
             $1, $2, 'RECENT_AUTH'::"MfaChallengePurpose",
             $3::"MfaChallengeAuthenticationMethod", $4, $5, $6, $7
           )`,
          [
            input.challengeId,
            input.userId,
            primaryAuthenticationMethod,
            input.sessionId ?? null,
            input.tokenHash,
            input.codeHash,
            input.expiresAt,
          ],
        );

        await client.query("COMMIT");
        return { status: "CREATED" as const, recipientEmail: user.email };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        await client.end();
      }
    },
  });
}

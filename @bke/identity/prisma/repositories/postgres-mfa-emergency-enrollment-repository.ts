import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type {
  IdentityMfaEmergencyEnrollmentCommitInput,
  IdentityMfaEmergencyEnrollmentRepository,
} from "../../logic/mfa-emergency-enrollment-repository";

export function createPostgresIdentityMfaEmergencyEnrollmentRepository(
  connectionString: string,
): IdentityMfaEmergencyEnrollmentRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Identity PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async enroll(input: IdentityMfaEmergencyEnrollmentCommitInput) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        await client.query("BEGIN");

        const authorization = await client.query<{
          id: string;
          ownerKeyVersion: number;
          deploymentEnvironment: string;
        }>(
          `SELECT "id", "ownerKeyVersion", "deploymentEnvironment"
             FROM "EmergencyMfaEnrollmentAuthorization"
            WHERE "userId" = $1
              AND "tokenHash" = $2
              AND "consumedAt" IS NULL
              AND "revokedAt" IS NULL
              AND "expiresAt" > $3
            FOR UPDATE`,
          [input.userId, input.emergencyTokenHash, input.enrolledAt],
        );

        if (authorization.rowCount !== 1) {
          await client.query("ROLLBACK");
          return { status: "INVALID_AUTHORIZATION" } as const;
        }

        const authorizationRow = authorization.rows[0];
        const consumed = await client.query(
          `UPDATE "EmergencyMfaEnrollmentAuthorization"
              SET "consumedAt" = $2
            WHERE "id" = $1
              AND "consumedAt" IS NULL
              AND "revokedAt" IS NULL
              AND "expiresAt" > $2`,
          [authorizationRow.id, input.enrolledAt],
        );
        if (consumed.rowCount !== 1) {
          await client.query("ROLLBACK");
          return { status: "INVALID_AUTHORIZATION" } as const;
        }

        await client.query(
          `INSERT INTO "AdministratorMfaMethod"
             ("id", "userId", "encryptedSecret", "pendingExpiresAt", "enabledAt", "verifiedAt", "disabledAt", "createdAt", "updatedAt")
           VALUES ($1, $2, NULL, NULL, $3, $3, NULL, $3, $3)
           ON CONFLICT ("userId") DO UPDATE
             SET "encryptedSecret" = NULL,
                 "pendingExpiresAt" = NULL,
                 "enabledAt" = EXCLUDED."enabledAt",
                 "verifiedAt" = EXCLUDED."verifiedAt",
                 "disabledAt" = NULL,
                 "updatedAt" = EXCLUDED."updatedAt"`,
          [randomUUID(), input.userId, input.enrolledAt],
        );

        await client.query(
          `DELETE FROM "AdministratorRecoveryCode" WHERE "userId" = $1`,
          [input.userId],
        );
        for (const hash of input.recoveryCodeHashes) {
          await client.query(
            `INSERT INTO "AdministratorRecoveryCode" ("id", "userId", "codeHash", "createdAt")
             VALUES ($1, $2, $3, $4)`,
            [randomUUID(), input.userId, hash, input.enrolledAt],
          );
        }

        await client.query(`DELETE FROM "MfaChallenge" WHERE "userId" = $1`, [
          input.userId,
        ]);

        await client.query(
          `UPDATE "Session"
              SET "revokedAt" = $2,
                  "revocationReason" = 'MFA_EMERGENCY_ENROLLED'
            WHERE "userId" = $1
              AND "revokedAt" IS NULL`,
          [input.userId, input.enrolledAt],
        );

        await client.query(
          `INSERT INTO "Session"
             ("id", "tokenHash", "userId", "expiresAt", "lastAuthenticatedAt",
              "mfaVerifiedAt", "recentAuthenticatedAt", "lastSeenAt", "absoluteExpiresAt",
              "authenticationMethod", "assuranceLevel", "createdAt")
           VALUES ($1, $2, $3, $4, $5, $5, $5, $5, $4,
                   'MFA_ENROLLMENT', 'RECENTLY_AUTHENTICATED', $5)`,
          [
            input.replacementSession.sessionId,
            input.replacementSession.tokenHash,
            input.userId,
            input.replacementSessionExpiresAt,
            input.enrolledAt,
          ],
        );

        await client.query("COMMIT");
        return {
          status: "ENROLLED",
          authorizationId: authorizationRow.id,
          ownerKeyVersion: authorizationRow.ownerKeyVersion,
          deploymentEnvironment: authorizationRow.deploymentEnvironment,
        } as const;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        await client.end();
      }
    },
  });
}

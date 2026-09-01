import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type {
  IdentityMfaEnrollmentStartPersistenceInput,
  IdentityMfaEnrollmentStartRepository,
} from "../../logic/mfa-enrollment-start-repository";

type EnrollmentPrincipalRow = {
  email: string;
  role: "CUSTOMER" | "ADMIN";
  mfaMethodId: string | null;
  mfaEnabledAt: Date | null;
};

export function createPostgresIdentityMfaEnrollmentStartRepository(
  connectionString: string,
): IdentityMfaEnrollmentStartRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Identity PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async startEnrollment(input: IdentityMfaEnrollmentStartPersistenceInput) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();

      try {
        await client.query("BEGIN");

        const principal = await client.query<EnrollmentPrincipalRow>(
          `SELECT
             u."email",
             u."role",
             m."id" AS "mfaMethodId",
             m."enabledAt" AS "mfaEnabledAt"
           FROM "User" u
           LEFT JOIN "AdministratorMfaMethod" m ON m."userId" = u."id"
          WHERE u."id" = $1
          LIMIT 1`,
          [input.userId],
        );
        const row = principal.rows[0];

        if (!row) {
          await client.query("ROLLBACK");
          return { status: "PRINCIPAL_NOT_FOUND" as const };
        }
        if (row.role !== "ADMIN") {
          await client.query("ROLLBACK");
          return { status: "FORBIDDEN" as const };
        }
        if (row.mfaEnabledAt) {
          await client.query("ROLLBACK");
          return { status: "MFA_ALREADY_ENABLED" as const };
        }

        if (row.mfaMethodId) {
          await client.query(
            `UPDATE "AdministratorMfaMethod"
                SET "encryptedSecret" = NULL,
                    "pendingExpiresAt" = $2,
                    "enabledAt" = NULL,
                    "verifiedAt" = NULL,
                    "disabledAt" = NULL,
                    "updatedAt" = $3
              WHERE "userId" = $1`,
            [input.userId, input.pendingExpiresAt, input.updatedAt],
          );
        } else {
          await client.query(
            `INSERT INTO "AdministratorMfaMethod" (
               "id",
               "userId",
               "encryptedSecret",
               "pendingExpiresAt",
               "updatedAt"
             ) VALUES ($1, $2, NULL, $3, $4)`,
            [
              randomUUID(),
              input.userId,
              input.pendingExpiresAt,
              input.updatedAt,
            ],
          );
        }

        await client.query(
          `DELETE FROM "MfaChallenge"
            WHERE "userId" = $1
              AND "purpose" = 'ENROLLMENT'::"MfaChallengePurpose"
              AND "consumedAt" IS NULL`,
          [input.userId],
        );

        await client.query(
          `INSERT INTO "MfaChallenge" (
             "id",
             "userId",
             "purpose",
             "tokenHash",
             "codeHash",
             "expiresAt"
           ) VALUES ($1, $2, 'ENROLLMENT'::"MfaChallengePurpose", $3, $4, $5)`,
          [
            input.challengeId,
            input.userId,
            input.tokenHash,
            input.codeHash,
            input.pendingExpiresAt,
          ],
        );

        await client.query("COMMIT");
        return { status: "STARTED" as const, recipientEmail: row.email };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        await client.end();
      }
    },
  });
}

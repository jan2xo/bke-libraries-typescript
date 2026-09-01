import { Client } from "pg";
import type { IdentityMfaDisableRepository } from "../../logic/mfa-disable-repository";

export function createPostgresIdentityMfaDisableRepository(
  connectionString: string,
): IdentityMfaDisableRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Identity PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async disableMfa(userId: string, disabledAt: Date) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        await client.query("BEGIN");

        const user = await client.query<{ role: "CUSTOMER" | "ADMIN" }>(
          `SELECT "role"
             FROM "User"
            WHERE "id" = $1
            FOR UPDATE`,
          [userId],
        );
        if (!user.rows[0]) {
          await client.query("ROLLBACK");
          return "NOT_FOUND" as const;
        }
        if (user.rows[0].role !== "ADMIN") {
          await client.query("ROLLBACK");
          return "FORBIDDEN" as const;
        }

        const method = await client.query<{ enabledAt: Date | null }>(
          `SELECT "enabledAt"
             FROM "AdministratorMfaMethod"
            WHERE "userId" = $1
            FOR UPDATE`,
          [userId],
        );
        if (!method.rows[0]?.enabledAt) {
          await client.query("ROLLBACK");
          return "MFA_NOT_ENABLED" as const;
        }

        await client.query(
          `UPDATE "AdministratorMfaMethod"
              SET "enabledAt" = NULL,
                  "disabledAt" = $2,
                  "pendingExpiresAt" = NULL,
                  "updatedAt" = $2
            WHERE "userId" = $1`,
          [userId, disabledAt],
        );

        await client.query(
          `DELETE FROM "AdministratorRecoveryCode" WHERE "userId" = $1`,
          [userId],
        );
        await client.query(
          `DELETE FROM "MfaChallenge" WHERE "userId" = $1`,
          [userId],
        );
        await client.query(
          `UPDATE "Session"
              SET "revokedAt" = $2,
                  "revocationReason" = 'MFA_DISABLED'
            WHERE "userId" = $1
              AND "revokedAt" IS NULL`,
          [userId, disabledAt],
        );

        await client.query("COMMIT");
        return "DISABLED" as const;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        await client.end();
      }
    },
  });
}

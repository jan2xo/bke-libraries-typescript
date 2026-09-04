import { Client } from "pg";
import type {
  IdentitySessionAdministrationPersistenceInput,
  IdentitySessionAdministrationPersistenceResult,
  IdentitySessionAdministrationRepository,
} from "../../logic/session-administration-repository";

export function createPostgresIdentitySessionAdministrationRepository(
  connectionString: string,
): IdentitySessionAdministrationRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Identity PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async revokeAdministratorSessions(
      input: IdentitySessionAdministrationPersistenceInput,
    ): Promise<IdentitySessionAdministrationPersistenceResult> {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        await client.query("BEGIN");

        const principal = await client.query<{ role: string }>(
          `SELECT "role" FROM "User" WHERE "id" = $1 LIMIT 1`,
          [input.userId],
        );
        if (!principal.rows[0]) {
          await client.query("ROLLBACK");
          return { status: "PRINCIPAL_NOT_FOUND" };
        }
        if (principal.rows[0].role !== "ADMIN") {
          await client.query("ROLLBACK");
          return { status: "FORBIDDEN" };
        }

        let result: IdentitySessionAdministrationPersistenceResult;
        if (input.action === "ONE") {
          const target = await client.query<{ userId: string; revokedAt: Date | null }>(
            `SELECT "userId", "revokedAt" FROM "Session" WHERE "id" = $1 LIMIT 1`,
            [input.targetSessionId],
          );
          if (!target.rows[0]) {
            await client.query("ROLLBACK");
            return { status: "SESSION_NOT_FOUND" };
          }
          if (target.rows[0].userId !== input.userId) {
            await client.query("ROLLBACK");
            return { status: "SESSION_NOT_OWNED" };
          }
          if (!target.rows[0].revokedAt) {
            await client.query(
              `UPDATE "Session"
                  SET "revokedAt" = $2,
                      "revocationReason" = 'ADMIN_REVOKED'
                WHERE "id" = $1`,
              [input.targetSessionId, input.revokedAt],
            );
          }
          result = {
            status: "REVOKED",
            signedOut: input.targetSessionId === input.currentSessionId,
          };
        } else {
          await client.query(
            `UPDATE "Session"
                SET "revokedAt" = $2,
                    "revocationReason" = $3
              WHERE "userId" = $1
                AND "revokedAt" IS NULL
                ${input.action === "OTHERS" ? 'AND "id" <> $4' : ""}`,
            input.action === "OTHERS"
              ? [input.userId, input.revokedAt, "ADMIN_REVOKED_OTHERS", input.currentSessionId]
              : [input.userId, input.revokedAt, "ADMIN_REVOKED_ALL"],
          );
          result = { status: "REVOKED", signedOut: input.action === "ALL" };
        }

        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        await client.end();
      }
    },
  });
}

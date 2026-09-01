import { Client } from "pg";
import type { IdentitySessionTerminationRepository } from "../../logic/session-termination-repository";

export function createPostgresIdentitySessionTerminationRepository(
  connectionString: string,
): IdentitySessionTerminationRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Identity PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async terminateSessionByTokenHash(tokenHash: string, terminatedAt: Date) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        await client.query(
          `UPDATE "Session"
              SET "revokedAt" = $2,
                  "revocationReason" = 'LOGOUT'
            WHERE "tokenHash" = $1
              AND "revokedAt" IS NULL`,
          [tokenHash, terminatedAt],
        );
      } finally {
        await client.end();
      }
    },
  });
}

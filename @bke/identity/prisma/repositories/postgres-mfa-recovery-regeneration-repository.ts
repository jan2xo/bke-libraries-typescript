import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type {
  IdentityMfaRecoveryRegenerationCommitInput,
  IdentityMfaRecoveryRegenerationRepository,
} from "../../logic/mfa-recovery-regeneration-repository";

export function createPostgresIdentityMfaRecoveryRegenerationRepository(
  connectionString: string,
): IdentityMfaRecoveryRegenerationRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Identity PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async regenerate(input: IdentityMfaRecoveryRegenerationCommitInput) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        await client.query("BEGIN");

        await client.query(
          `DELETE FROM "AdministratorRecoveryCode" WHERE "userId" = $1`,
          [input.userId],
        );

        for (const hash of input.recoveryCodeHashes) {
          await client.query(
            `INSERT INTO "AdministratorRecoveryCode" ("id", "userId", "codeHash")
             VALUES ($1, $2, $3)`,
            [randomUUID(), input.userId, hash],
          );
        }

        await client.query(
          `UPDATE "Session"
              SET "revokedAt" = $2,
                  "revocationReason" = 'RECOVERY_CODES_REGENERATED'
            WHERE "userId" = $1
              AND "revokedAt" IS NULL`,
          [input.userId, input.regeneratedAt],
        );

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        await client.end();
      }
    },
  });
}

import { Client } from "pg";
import type {
  IdentityRecentAuthChallengePersistenceInput,
  IdentityRecentAuthChallengeRepository,
} from "../../logic/recent-auth-challenge-repository";

type PrincipalRow = {
  email: string;
  role: "CUSTOMER" | "ADMIN";
};

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
          `SELECT "email", "role"
             FROM "User"
            WHERE "id" = $1
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

        await client.query(
          `DELETE FROM "MfaChallenge"
            WHERE "userId" = $1
              AND "purpose" = 'RECENT_AUTH'::"MfaChallengePurpose"
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
           ) VALUES ($1, $2, 'RECENT_AUTH'::"MfaChallengePurpose", $3, $4, $5)`,
          [
            input.challengeId,
            input.userId,
            input.tokenHash,
            input.codeHash,
            input.expiresAt,
          ],
        );

        await client.query("COMMIT");
        return {
          status: "CREATED" as const,
          recipientEmail: row.email,
        };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        await client.end();
      }
    },
  });
}

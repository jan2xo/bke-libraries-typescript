import { Client } from "pg";
import type {
  IdentityEmailVerificationCompletionPersistenceResult,
  IdentityEmailVerificationCompletionRepository,
} from "../../logic/email-verification-completion-repository";

type ConsumedTokenRow = {
  identifier: string;
};

type VerifiedPrincipalRow = {
  id: string;
  email: string;
};

export function createPostgresIdentityEmailVerificationCompletionRepository(
  connectionString: string,
): IdentityEmailVerificationCompletionRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Identity PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async completeVerification(
      tokenHash: string,
      completedAt: Date,
    ): Promise<IdentityEmailVerificationCompletionPersistenceResult> {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        await client.query("BEGIN");

        const consumed = await client.query<ConsumedTokenRow>(
          `UPDATE "VerificationToken"
              SET "usedAt" = $2
            WHERE "tokenHash" = $1
              AND "purpose" = 'VERIFY_EMAIL'
              AND "usedAt" IS NULL
              AND "expiresAt" >= $2
          RETURNING "identifier"`,
          [tokenHash, completedAt],
        );
        const token = consumed.rows[0];
        if (!token) {
          await client.query("ROLLBACK");
          return { status: "INVALID_TOKEN" };
        }

        const verified = await client.query<VerifiedPrincipalRow>(
          `UPDATE "User"
              SET "emailVerified" = $2,
                  "updatedAt" = $2
            WHERE "email" = $1
          RETURNING "id", "email"`,
          [token.identifier, completedAt],
        );
        const principal = verified.rows[0];
        if (!principal) {
          throw new Error(
            "Identity email verification token referenced a missing principal.",
          );
        }

        await client.query("COMMIT");
        return {
          status: "VERIFIED",
          userId: principal.id,
          email: principal.email,
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

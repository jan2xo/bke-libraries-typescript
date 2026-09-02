import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type {
  LicensingLicenseKeyRevealRecord,
  LicensingLicenseKeyRevealRepository,
} from "../../logic/license-key-reveal-repository";

type RevealRow = {
  id: string;
  accountId: string;
  keyCiphertext: string | null;
  keyRevealedAt: Date | null;
};

export function createPostgresLicensingLicenseKeyRevealRepository(
  connectionString: string,
): LicensingLicenseKeyRevealRepository {
  const normalized = connectionString.trim();
  if (!normalized) throw new Error("Licensing PostgreSQL connection string is required.");

  return Object.freeze({
    async findByIdAndAccount(input: {
      readonly licenseId: string;
      readonly accountId: string;
    }): Promise<LicensingLicenseKeyRevealRecord | null> {
      const client = new Client({ connectionString: normalized });
      await client.connect();
      try {
        const result = await client.query<RevealRow>(
          `SELECT "id", "accountId", "keyCiphertext", "keyRevealedAt"
             FROM "License"
            WHERE "id" = $1 AND "accountId" = $2`,
          [input.licenseId, input.accountId],
        );
        return result.rows[0] ?? null;
      } finally {
        await client.end();
      }
    },

    async recordSuccessfulReveal(input: {
      readonly licenseId: string;
      readonly accountId: string;
      readonly actorPrincipalId: string;
      readonly revealedAt: Date;
    }) {
      const client = new Client({ connectionString: normalized });
      await client.connect();
      try {
        await client.query("BEGIN");
        const currentResult = await client.query<{ keyRevealedAt: Date | null }>(
          `SELECT "keyRevealedAt"
             FROM "License"
            WHERE "id" = $1 AND "accountId" = $2
            FOR UPDATE`,
          [input.licenseId, input.accountId],
        );
        const current = currentResult.rows[0];
        if (!current) {
          await client.query("ROLLBACK");
          return { status: "NOT_FOUND" as const };
        }

        const firstReveal = current.keyRevealedAt === null;
        const effectiveRevealedAt = current.keyRevealedAt ?? input.revealedAt;
        if (firstReveal) {
          await client.query(
            `UPDATE "License"
                SET "keyRevealedAt" = $3
              WHERE "id" = $1 AND "accountId" = $2`,
            [input.licenseId, input.accountId, effectiveRevealedAt],
          );
        }

        await client.query(
          `INSERT INTO "LicenseEvent" ("id", "licenseId", "type", "metadata")
           VALUES ($1, $2, 'CUSTOMER_REVEALED', $3::jsonb)`,
          [
            randomUUID(),
            input.licenseId,
            JSON.stringify({ actorId: input.actorPrincipalId }),
          ],
        );

        await client.query("COMMIT");
        return {
          status: "RECORDED" as const,
          keyRevealedAt: effectiveRevealedAt,
          firstReveal,
        };
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Preserve the original persistence failure.
        }
        throw error;
      } finally {
        await client.end();
      }
    },
  });
}

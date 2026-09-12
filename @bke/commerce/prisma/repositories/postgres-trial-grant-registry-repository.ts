import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type {
  CommerceRecordTrialGrantInput,
  CommerceTrialGrantSnapshot,
} from "../../contracts/trial-grant-registry.contract";
import type { CommerceTrialGrantRegistryRepository } from "../../logic/trial-grant-registry";

async function withClient<T>(
  connectionString: string,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

const selection = `"id", "accountId", "productId", "editionId", "licenseId", "source",
                   "selfServiceYear", "trialStartsAt", "trialEndsAt", "graceEndsAt",
                   "revokedAt", "createdById", "createdAt"`;

export function createPostgresCommerceTrialGrantRegistryRepository(
  connectionString: string,
): CommerceTrialGrantRegistryRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Commerce PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async findSelfServiceGrant(input: {
      readonly accountId: string;
      readonly productId: string;
      readonly year: number;
    }): Promise<CommerceTrialGrantSnapshot | null> {
      return withClient(normalizedConnectionString, async (client) => {
        const result = await client.query<CommerceTrialGrantSnapshot>(
          `SELECT ${selection}
             FROM "TrialGrant"
            WHERE "accountId" = $1
              AND "productId" = $2
              AND "selfServiceYear" = $3
            LIMIT 1`,
          [input.accountId, input.productId, input.year],
        );
        return result.rows[0] ?? null;
      });
    },

    async create(input: CommerceRecordTrialGrantInput): Promise<CommerceTrialGrantSnapshot> {
      return withClient(normalizedConnectionString, async (client) => {
        const result = await client.query<CommerceTrialGrantSnapshot>(
          `INSERT INTO "TrialGrant"
             ("id", "accountId", "productId", "editionId", "licenseId", "source",
              "selfServiceYear", "trialStartsAt", "trialEndsAt", "graceEndsAt", "createdById")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING ${selection}`,
          [
            randomUUID(),
            input.accountId,
            input.productId,
            input.editionId,
            input.licenseId,
            input.source,
            input.selfServiceYear ?? null,
            input.trialStartsAt,
            input.trialEndsAt,
            input.graceEndsAt,
            input.createdById ?? null,
          ],
        );
        const row = result.rows[0];
        if (!row) throw new Error("Commerce trial grant creation returned no row.");
        return row;
      });
    },

    async findById(trialId: string): Promise<CommerceTrialGrantSnapshot | null> {
      return withClient(normalizedConnectionString, async (client) => {
        const result = await client.query<CommerceTrialGrantSnapshot>(
          `SELECT ${selection} FROM "TrialGrant" WHERE "id" = $1`,
          [trialId],
        );
        return result.rows[0] ?? null;
      });
    },

    async setGrace(input: {
      readonly trialId: string;
      readonly graceEndsAt: Date;
    }): Promise<CommerceTrialGrantSnapshot | null> {
      return withClient(normalizedConnectionString, async (client) => {
        const result = await client.query<CommerceTrialGrantSnapshot>(
          `UPDATE "TrialGrant"
              SET "graceEndsAt" = $2
            WHERE "id" = $1
            RETURNING ${selection}`,
          [input.trialId, input.graceEndsAt],
        );
        return result.rows[0] ?? null;
      });
    },

    async revoke(input: {
      readonly trialId: string;
      readonly revokedAt: Date;
    }): Promise<CommerceTrialGrantSnapshot | null> {
      return withClient(normalizedConnectionString, async (client) => {
        const result = await client.query<CommerceTrialGrantSnapshot>(
          `UPDATE "TrialGrant"
              SET "revokedAt" = COALESCE("revokedAt", $2)
            WHERE "id" = $1
            RETURNING ${selection}`,
          [input.trialId, input.revokedAt],
        );
        return result.rows[0] ?? null;
      });
    },
  });
}

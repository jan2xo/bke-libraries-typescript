import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type { LicensingGraceProduct } from "../../contracts/grace-period.contract";
import type {
  LicensingGraceAtomicEffectTransaction,
  LicensingGracePeriodStore,
  LicensingGraceRecord,
  LicensingGraceTransaction,
} from "../../logic/grace-period-ports";

type GraceRow = {
  productKey: string;
  graceEnabled: boolean;
};

function record(row: GraceRow | undefined): LicensingGraceRecord | null {
  return row ? Object.freeze({ productKey: row.productKey, graceEnabled: row.graceEnabled }) : null;
}

async function withClient<T>(connectionString: string, work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

function transactionFor(client: Client): LicensingGraceTransaction {
  const effectTransaction = Object.freeze<LicensingGraceAtomicEffectTransaction>({
    async execute(statement, values = []) {
      await client.query(statement, [...values]);
    },
  });

  return Object.freeze({
    async findState(productKey) {
      const result = await client.query<GraceRow>(
        `SELECT "productKey", "graceEnabled"
           FROM "ProductGraceOverride"
          WHERE "productKey" = $1
          FOR UPDATE`,
        [productKey],
      );
      return record(result.rows[0]);
    },

    async upsertState(productKey, graceEnabled) {
      const now = new Date();
      await client.query(
        `INSERT INTO "ProductGraceOverride" ("id", "productKey", "graceEnabled", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $4)
         ON CONFLICT ("productKey") DO UPDATE
           SET "graceEnabled" = EXCLUDED."graceEnabled",
               "updatedAt" = EXCLUDED."updatedAt"`,
        [randomUUID(), productKey, graceEnabled, now],
      );
    },

    effectTransaction,
  });
}

export function createPostgresLicensingGracePeriodStore(connectionString: string): LicensingGracePeriodStore {
  const normalized = connectionString.trim();
  if (!normalized) throw new Error("Licensing PostgreSQL connection string is required.");

  return Object.freeze({
    async findState(productKey) {
      return withClient(normalized, async (client) => {
        const result = await client.query<GraceRow>(
          `SELECT "productKey", "graceEnabled"
             FROM "ProductGraceOverride"
            WHERE "productKey" = $1`,
          [productKey],
        );
        return record(result.rows[0]);
      });
    },

    async findStates(productKeys: readonly LicensingGraceProduct[]) {
      return withClient(normalized, async (client) => {
        const result = await client.query<GraceRow>(
          `SELECT "productKey", "graceEnabled"
             FROM "ProductGraceOverride"
            WHERE "productKey" = ANY($1::text[])`,
          [[...productKeys]],
        );
        return Object.freeze(result.rows.map((row) => Object.freeze({ ...row })));
      });
    },

    async withTransaction<T>(work: (transaction: LicensingGraceTransaction) => Promise<T>): Promise<T> {
      return withClient(normalized, async (client) => {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        try {
          const result = await work(transactionFor(client));
          await client.query("COMMIT");
          return result;
        } catch (error) {
          try {
            await client.query("ROLLBACK");
          } catch {
            // Preserve the original transaction failure.
          }
          throw error;
        }
      });
    },
  });
}

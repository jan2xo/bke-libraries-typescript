import { Client } from "pg";
import type {
  PaymentsCheckoutAttemptClaim,
  PaymentsCheckoutAttemptRecord,
  PaymentsCheckoutAttemptRepository,
} from "../../logic/checkout-attempt-repository";

interface CheckoutAttemptRow {
  id: string;
  sourceReference: string;
  commercialReference: string;
  provider: string;
  requestFingerprint: string;
  amountMinor: number;
  currency: string;
  payerSnapshot: unknown;
  itemsSnapshot: unknown;
  status: "CREATING" | "PENDING" | "FAILED";
  externalCheckoutId: string | null;
  checkoutUrl: string | null;
  failureCode: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

function toRecord(row: CheckoutAttemptRow): PaymentsCheckoutAttemptRecord {
  return Object.freeze({
    ...row,
    amountMinor: Number(row.amountMinor),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  });
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

export function createPostgresPaymentsCheckoutAttemptRepository(
  connectionString: string,
): PaymentsCheckoutAttemptRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Payments PostgreSQL connection string is required.");
  }

  async function withClient<T>(operation: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client({ connectionString: normalizedConnectionString });
    await client.connect();
    try {
      return await operation(client);
    } finally {
      await client.end();
    }
  }

  return Object.freeze({
    async claim(input: PaymentsCheckoutAttemptClaim) {
      return withClient(async (client) => {
        const inserted = await client.query<CheckoutAttemptRow>(
          `INSERT INTO "PaymentCheckoutAttempt" (
             "id", "sourceReference", "commercialReference", "provider", "requestFingerprint",
             "amountMinor", "currency", "payerSnapshot", "itemsSnapshot", "status"
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, 'CREATING')
           ON CONFLICT ("sourceReference") DO NOTHING
           RETURNING *`,
          [
            input.id,
            input.sourceReference,
            input.commercialReference,
            input.provider,
            input.requestFingerprint,
            input.amountMinor,
            input.currency,
            json(input.payerSnapshot),
            json(input.itemsSnapshot),
          ],
        );
        if (inserted.rowCount === 1) {
          return { created: true, record: toRecord(inserted.rows[0]!) };
        }
        const existing = await client.query<CheckoutAttemptRow>(
          `SELECT * FROM "PaymentCheckoutAttempt" WHERE "sourceReference" = $1`,
          [input.sourceReference],
        );
        if (existing.rowCount !== 1) {
          throw new Error("Payments checkout attempt claim disappeared.");
        }
        return { created: false, record: toRecord(existing.rows[0]!) };
      });
    },

    async markPending(id: string, externalCheckoutId: string, checkoutUrl: string) {
      return withClient(async (client) => {
        const result = await client.query<CheckoutAttemptRow>(
          `UPDATE "PaymentCheckoutAttempt"
              SET "status" = 'PENDING',
                  "externalCheckoutId" = $2,
                  "checkoutUrl" = $3,
                  "failureCode" = NULL,
                  "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = $1
            RETURNING *`,
          [id, externalCheckoutId, checkoutUrl],
        );
        if (result.rowCount !== 1) throw new Error("Payments checkout attempt was not found.");
        return toRecord(result.rows[0]!);
      });
    },

    async markFailed(id: string, failureCode: string) {
      return withClient(async (client) => {
        const result = await client.query<CheckoutAttemptRow>(
          `UPDATE "PaymentCheckoutAttempt"
              SET "status" = 'FAILED',
                  "failureCode" = $2,
                  "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = $1
            RETURNING *`,
          [id, failureCode],
        );
        if (result.rowCount !== 1) throw new Error("Payments checkout attempt was not found.");
        return toRecord(result.rows[0]!);
      });
    },
  });
}

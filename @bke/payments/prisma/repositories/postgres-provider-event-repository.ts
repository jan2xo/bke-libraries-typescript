import { Client } from "pg";
import type {
  PaymentsProviderEventClaim,
  PaymentsProviderEventRecord,
  PaymentsProviderEventRepository,
} from "../../logic/provider-event-repository";
import type {
  PaymentsProviderEventType,
  PaymentsRefundStatus,
} from "../../contracts/provider-event-ingestion.contract";

interface ProviderEventRow {
  id: string;
  provider: string;
  eventId: string;
  payloadHash: string;
  eventFingerprint: string;
  rawType: string | null;
  type: PaymentsProviderEventType;
  externalPaymentId: string | null;
  externalCheckoutId: string | null;
  reference: string | null;
  externalRefundId: string | null;
  refundStatus: PaymentsRefundStatus | null;
  amountMinor: number | null;
  currency: string | null;
  livemode: boolean;
  occurredAt: Date | string;
  receivedAt: Date | string;
}

function toRecord(row: ProviderEventRow): PaymentsProviderEventRecord {
  return Object.freeze({
    ...row,
    amountMinor: row.amountMinor === null ? null : Number(row.amountMinor),
    occurredAt: new Date(row.occurredAt),
    receivedAt: new Date(row.receivedAt),
  });
}

export function createPostgresPaymentsProviderEventRepository(
  connectionString: string,
): PaymentsProviderEventRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) throw new Error("Payments PostgreSQL connection string is required.");

  return Object.freeze({
    async claim(input: PaymentsProviderEventClaim) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        const inserted = await client.query<ProviderEventRow>(
          `INSERT INTO "PaymentProviderEvent" (
             "id", "provider", "eventId", "payloadHash", "eventFingerprint", "rawType", "type",
             "externalPaymentId", "externalCheckoutId", "reference", "externalRefundId", "refundStatus",
             "amountMinor", "currency", "livemode", "occurredAt"
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           ON CONFLICT ("provider", "eventId") DO NOTHING
           RETURNING *`,
          [
            input.id,
            input.provider,
            input.eventId,
            input.payloadHash,
            input.eventFingerprint,
            input.rawType,
            input.type,
            input.externalPaymentId,
            input.externalCheckoutId,
            input.reference,
            input.externalRefundId,
            input.refundStatus,
            input.amountMinor,
            input.currency,
            input.livemode,
            input.occurredAt,
          ],
        );
        if (inserted.rowCount === 1) {
          return { created: true, record: toRecord(inserted.rows[0]!) };
        }

        const existing = await client.query<ProviderEventRow>(
          `SELECT * FROM "PaymentProviderEvent" WHERE "provider" = $1 AND "eventId" = $2`,
          [input.provider, input.eventId],
        );
        if (existing.rowCount !== 1) throw new Error("Payments provider event claim disappeared.");
        return { created: false, record: toRecord(existing.rows[0]!) };
      } finally {
        await client.end();
      }
    },
  });
}

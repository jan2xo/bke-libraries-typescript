import { Client } from "pg";
import type { PaymentsSettlementFactSnapshot } from "../../contracts/settlement-fact.contract";
import type { PaymentsCheckoutAttemptRecord } from "../../logic/checkout-attempt-repository";
import type {
  PaymentsSettlementFactClaim,
  PaymentsSettlementFactRepository,
} from "../../logic/settlement-fact-repository";
import type { PaymentsProviderEventRecord } from "../../logic/provider-event-repository";

interface SettlementRow {
  id: string;
  providerEventRecordId: string;
  checkoutAttemptId: string;
  provider: string;
  eventId: string;
  externalPaymentId: string;
  externalCheckoutId: string;
  commercialReference: string;
  amountMinor: number;
  currency: string;
  livemode: boolean;
  settledAt: Date | string;
  createdAt: Date | string;
}

function toSettlement(row: SettlementRow): PaymentsSettlementFactSnapshot {
  return Object.freeze({
    settlementFactId: row.id,
    providerEventRecordId: row.providerEventRecordId,
    checkoutAttemptId: row.checkoutAttemptId,
    provider: row.provider,
    eventId: row.eventId,
    externalPaymentId: row.externalPaymentId,
    externalCheckoutId: row.externalCheckoutId,
    commercialReference: row.commercialReference,
    amountMinor: Number(row.amountMinor),
    currency: row.currency,
    livemode: row.livemode,
    settledAt: new Date(row.settledAt),
    createdAt: new Date(row.createdAt),
  });
}

export function createPostgresPaymentsSettlementFactRepository(
  connectionString: string,
): PaymentsSettlementFactRepository {
  const normalized = connectionString.trim();
  if (!normalized) throw new Error("Payments PostgreSQL connection string is required.");

  async function withClient<T>(operation: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client({ connectionString: normalized });
    await client.connect();
    try {
      return await operation(client);
    } finally {
      await client.end();
    }
  }

  return Object.freeze({
    async findProviderEventById(id: string) {
      return withClient(async (client) => {
        const result = await client.query(
          `SELECT * FROM "PaymentProviderEvent" WHERE "id" = $1`, [id],
        );
        if (result.rowCount === 0) return null;
        const row = result.rows[0] as any;
        const record: PaymentsProviderEventRecord = Object.freeze({
          id: row.id,
          provider: row.provider,
          eventId: row.eventId,
          payloadHash: row.payloadHash,
          eventFingerprint: row.eventFingerprint,
          rawType: row.rawType,
          type: row.type,
          externalPaymentId: row.externalPaymentId,
          externalCheckoutId: row.externalCheckoutId,
          reference: row.reference,
          externalRefundId: row.externalRefundId,
          refundStatus: row.refundStatus,
          amountMinor: row.amountMinor === null ? null : Number(row.amountMinor),
          currency: row.currency,
          livemode: row.livemode,
          occurredAt: new Date(row.occurredAt),
          receivedAt: new Date(row.receivedAt),
        });
        return record;
      });
    },

    async findCheckoutAttempt(provider: string, externalCheckoutId: string) {
      return withClient(async (client) => {
        const result = await client.query(
          `SELECT * FROM "PaymentCheckoutAttempt" WHERE "provider" = $1 AND "externalCheckoutId" = $2`,
          [provider, externalCheckoutId],
        );
        if (result.rowCount === 0) return null;
        const row = result.rows[0] as any;
        const record: PaymentsCheckoutAttemptRecord = Object.freeze({
          ...row,
          amountMinor: Number(row.amountMinor),
          createdAt: new Date(row.createdAt),
          updatedAt: new Date(row.updatedAt),
        });
        return record;
      });
    },

    async claim(input: PaymentsSettlementFactClaim) {
      return withClient(async (client) => {
        const inserted = await client.query<SettlementRow>(
          `INSERT INTO "PaymentSettlementFact" (
             "id", "providerEventRecordId", "checkoutAttemptId", "provider", "eventId",
             "externalPaymentId", "externalCheckoutId", "commercialReference", "amountMinor",
             "currency", "livemode", "settledAt"
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT DO NOTHING
           RETURNING *`,
          [input.id, input.providerEventRecordId, input.checkoutAttemptId, input.provider, input.eventId,
           input.externalPaymentId, input.externalCheckoutId, input.commercialReference, input.amountMinor,
           input.currency, input.livemode, input.settledAt],
        );
        if (inserted.rowCount === 1) return { created: true, record: toSettlement(inserted.rows[0]!) };
        const existing = await client.query<SettlementRow>(
          `SELECT * FROM "PaymentSettlementFact"
            WHERE "providerEventRecordId" = $1 OR ("provider" = $2 AND "externalPaymentId" = $3)
            ORDER BY CASE WHEN "providerEventRecordId" = $1 THEN 0 ELSE 1 END
            LIMIT 1`,
          [input.providerEventRecordId, input.provider, input.externalPaymentId],
        );
        if (existing.rowCount !== 1) throw new Error("Payments settlement claim disappeared.");
        return { created: false, record: toSettlement(existing.rows[0]!) };
      });
    },
  });
}

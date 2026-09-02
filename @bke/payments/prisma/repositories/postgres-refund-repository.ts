import { Client } from "pg";
import type {
  PaymentsRefundOperationSnapshot,
  PaymentsRefundOperationState,
  PaymentsRefundReason,
} from "../../contracts/refund-initiation.contract";
import type { PaymentsSettlementFactSnapshot } from "../../contracts/settlement-fact.contract";
import type {
  PaymentsRefundOperationClaim,
  PaymentsRefundRepository,
} from "../../logic/refund-repository";

interface RefundRow {
  id: string;
  sourceReference: string;
  settlementFactId: string;
  provider: string;
  externalPaymentId: string;
  externalRefundId: string | null;
  amountMinor: number;
  currency: string;
  reason: PaymentsRefundReason;
  notes: string | null;
  state: PaymentsRefundOperationState;
  createdAt: Date | string;
  updatedAt: Date | string;
}

function toRefund(row: RefundRow): PaymentsRefundOperationSnapshot & { readonly notes: string | null } {
  return Object.freeze({
    refundOperationId: row.id,
    sourceReference: row.sourceReference,
    settlementFactId: row.settlementFactId,
    provider: row.provider,
    externalPaymentId: row.externalPaymentId,
    ...(row.externalRefundId ? { externalRefundId: row.externalRefundId } : {}),
    amountMinor: Number(row.amountMinor),
    currency: row.currency,
    reason: row.reason,
    notes: row.notes,
    state: row.state,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  });
}

function toSettlement(row: any): PaymentsSettlementFactSnapshot {
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

export function createPostgresPaymentsRefundRepository(connectionString: string): PaymentsRefundRepository {
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
    async findSettlementFact(id: string) {
      return withClient(async (client) => {
        const result = await client.query(`SELECT * FROM "PaymentSettlementFact" WHERE "id" = $1`, [id]);
        return result.rowCount === 1 ? toSettlement(result.rows[0]) : null;
      });
    },

    async claim(input: PaymentsRefundOperationClaim) {
      return withClient(async (client) => {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        try {
          const existing = await client.query<RefundRow>(
            `SELECT * FROM "PaymentRefundOperation" WHERE "sourceReference" = $1`,
            [input.sourceReference],
          );
          if (existing.rowCount === 1) {
            await client.query("COMMIT");
            return { outcome: "CLAIMED" as const, created: false, record: toRefund(existing.rows[0]!) };
          }

          const settlement = await client.query<{ amountMinor: number }>(
            `SELECT "amountMinor" FROM "PaymentSettlementFact" WHERE "id" = $1 FOR UPDATE`,
            [input.settlementFactId],
          );
          if (settlement.rowCount !== 1) throw new Error("Payments settlement fact disappeared.");

          const reserved = await client.query<{ total: string | number }>(
            `SELECT COALESCE(SUM("amountMinor"), 0) AS total
               FROM "PaymentRefundOperation"
              WHERE "settlementFactId" = $1
                AND "state" IN ('CREATING', 'PENDING', 'SUCCEEDED')`,
            [input.settlementFactId],
          );
          const totalReserved = Number(reserved.rows[0]?.total ?? 0);
          if (totalReserved + input.amountMinor > Number(settlement.rows[0]!.amountMinor)) {
            await client.query("ROLLBACK");
            return { outcome: "AMOUNT_EXCEEDS_SETTLEMENT" as const };
          }

          const inserted = await client.query<RefundRow>(
            `INSERT INTO "PaymentRefundOperation" (
               "id", "sourceReference", "settlementFactId", "provider", "externalPaymentId",
               "amountMinor", "currency", "reason", "notes", "state"
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'CREATING')
             RETURNING *`,
            [
              input.id,
              input.sourceReference,
              input.settlementFactId,
              input.provider,
              input.externalPaymentId,
              input.amountMinor,
              input.currency,
              input.reason,
              input.notes,
            ],
          );
          await client.query("COMMIT");
          return { outcome: "CLAIMED" as const, created: true, record: toRefund(inserted.rows[0]!) };
        } catch (error) {
          await client.query("ROLLBACK").catch(() => undefined);
          throw error;
        }
      });
    },

    async markProviderResult(
      id: string,
      externalRefundId: string,
      state: "PENDING" | "SUCCEEDED" | "FAILED",
    ) {
      return withClient(async (client) => {
        const result = await client.query<RefundRow>(
          `UPDATE "PaymentRefundOperation"
              SET "externalRefundId" = $2,
                  "state" = $3,
                  "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = $1
            RETURNING *`,
          [id, externalRefundId, state],
        );
        if (result.rowCount !== 1) throw new Error("Payments refund operation not found.");
        return toRefund(result.rows[0]!);
      });
    },

    async markFailed(id: string) {
      return withClient(async (client) => {
        const result = await client.query<RefundRow>(
          `UPDATE "PaymentRefundOperation"
              SET "state" = 'FAILED',
                  "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = $1
            RETURNING *`,
          [id],
        );
        if (result.rowCount !== 1) throw new Error("Payments refund operation not found.");
        return toRefund(result.rows[0]!);
      });
    },
  });
}

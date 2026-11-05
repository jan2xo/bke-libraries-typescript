import { Client } from "pg";
import type { PaymentsPaymentIntentAttemptClaim, PaymentsPaymentIntentAttemptRecord, PaymentsPaymentIntentAttemptRepository, PaymentsPaymentIntentAttemptStatus, PaymentsPaymentIntentCreateLease } from "../../logic/payment-intent-repository";
import type { PaymentsPaymentIntentStatus } from "../../contracts/payment-intent.contract";
interface Row {
  id: string; sourceReference: string; commercialReference: string; provider: string; requestFingerprint: string;
  amountMinor: number; currency: string; paymentMethodAllowed: string[]; livemode: boolean; idempotencyKey: string;
  idempotencyExpiresAt: Date | string; createDispatchedAt: Date | string | null; createLeaseUntil: Date | string | null;
  paymentIntentId: string | null; status: PaymentsPaymentIntentAttemptStatus; failureCode: string | null;
  createdAt: Date | string; updatedAt: Date | string;
}
function record(row: Row): PaymentsPaymentIntentAttemptRecord {
  return Object.freeze({ ...row, amountMinor: Number(row.amountMinor), paymentMethodAllowed: Object.freeze([...(row.paymentMethodAllowed ?? [])]),
    idempotencyExpiresAt: new Date(row.idempotencyExpiresAt), createDispatchedAt: row.createDispatchedAt ? new Date(row.createDispatchedAt) : null,
    createLeaseUntil: row.createLeaseUntil ? new Date(row.createLeaseUntil) : null, createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt) });
}
export function createPostgresPaymentsPaymentIntentRepository(connectionString: string): PaymentsPaymentIntentAttemptRepository {
  const url = connectionString.trim();
  if (!url) throw new Error("Payments PostgreSQL connection string is required.");
  async function use<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client({ connectionString: url }); await client.connect();
    try { return await fn(client); } finally { await client.end(); }
  }
  return Object.freeze({
    async findById(id: string) {
      return use(async (c) => { const q = await c.query<Row>('SELECT * FROM "PaymentIntentAttempt" WHERE "id"=$1', [id]); return q.rows[0] ? record(q.rows[0]) : null; });
    },
    async findByProviderIntent(provider: string, paymentIntentId: string) {
      return use(async (c) => { const q = await c.query<Row>('SELECT * FROM "PaymentIntentAttempt" WHERE "provider"=$1 AND "paymentIntentId"=$2', [provider, paymentIntentId]); return q.rows[0] ? record(q.rows[0]) : null; });
    },
    async claim(input: PaymentsPaymentIntentAttemptClaim): Promise<{ readonly created: boolean; readonly record: PaymentsPaymentIntentAttemptRecord }> {
      return use(async (c) => {
        const inserted = await c.query<Row>(
          'INSERT INTO "PaymentIntentAttempt" ("id","sourceReference","commercialReference","provider","requestFingerprint","amountMinor","currency","paymentMethodAllowed","livemode","idempotencyKey","idempotencyExpiresAt","status") VALUES ($1,$2,$3,$4,$5,$6,$7,$8::text[],$9,$10,$11,\'CREATING\') ON CONFLICT ("sourceReference") DO NOTHING RETURNING *',
          [input.id,input.sourceReference,input.commercialReference,input.provider,input.requestFingerprint,input.amountMinor,input.currency,input.paymentMethodAllowed,input.livemode,input.idempotencyKey,input.idempotencyExpiresAt]);
        if (inserted.rowCount === 1) return { created: true, record: record(inserted.rows[0]!) };
        const existing = await c.query<Row>('SELECT * FROM "PaymentIntentAttempt" WHERE "sourceReference"=$1', [input.sourceReference]);
        if (existing.rowCount !== 1) throw new Error("Payment Intent attempt claim disappeared.");
        return { created: false, record: record(existing.rows[0]!) };
      });
    },
    async beginCreate(id: string, now: Date, leaseMs: number): Promise<PaymentsPaymentIntentCreateLease> {
      return use(async (c) => {
        const updated = await c.query<Row>(
          'UPDATE "PaymentIntentAttempt" SET "createDispatchedAt"=COALESCE("createDispatchedAt",$2),"createLeaseUntil"=$2+($3 * INTERVAL \'1 millisecond\'),"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1 AND "paymentIntentId" IS NULL AND "status" IN (\'CREATING\',\'UNKNOWN\') AND ("createLeaseUntil" IS NULL OR "createLeaseUntil"<=$2) AND "idempotencyExpiresAt">$2 RETURNING *',
          [id, now, leaseMs]);
        if (updated.rowCount === 1) return { status: "ACQUIRED", record: record(updated.rows[0]!) };
        const found = await c.query<Row>('SELECT * FROM "PaymentIntentAttempt" WHERE "id"=$1', [id]);
        if (found.rowCount !== 1) throw new Error("Payment Intent attempt not found.");
        const current = record(found.rows[0]!);
        if (current.paymentIntentId) return { status: "ALREADY_BOUND", record: current };
        if (current.idempotencyExpiresAt.getTime() <= now.getTime()) return { status: "EXPIRED", record: current };
        return { status: "BUSY", record: current };
      });
    },
    async markUnknown(id: string): Promise<void> {
      await use(async (c) => { await c.query('UPDATE "PaymentIntentAttempt" SET "status"=\'UNKNOWN\',"createLeaseUntil"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1 AND "paymentIntentId" IS NULL', [id]); });
    },
    async markFailed(id: string, failureCode: string): Promise<void> {
      await use(async (c) => { await c.query('UPDATE "PaymentIntentAttempt" SET "status"=\'FAILED\',"failureCode"=$2,"createLeaseUntil"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1 AND "paymentIntentId" IS NULL', [id, failureCode.slice(0,100)]); });
    },
    async bindPaymentIntent(id: string, paymentIntentId: string, status: PaymentsPaymentIntentStatus): Promise<PaymentsPaymentIntentAttemptRecord> {
      const state: PaymentsPaymentIntentAttemptStatus = status === "awaiting_payment_method" ? "AWAITING_PAYMENT_METHOD" :
        status === "awaiting_next_action" ? "AWAITING_NEXT_ACTION" : status === "processing" ? "PROCESSING" :
        status === "succeeded" ? "SUCCEEDED" : "CANCELLED";
      return use(async (c) => {
        const q = await c.query<Row>(
          'UPDATE "PaymentIntentAttempt" SET "paymentIntentId"=$2,"status"=$3,"failureCode"=NULL,"createLeaseUntil"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1 AND ("paymentIntentId" IS NULL OR "paymentIntentId"=$2) RETURNING *',
          [id,paymentIntentId,state]);
        if (q.rowCount !== 1) throw new Error("Payment Intent identity binding conflict.");
        return record(q.rows[0]!);
      });
    },    async updateStatus(id: string, status: PaymentsPaymentIntentStatus): Promise<PaymentsPaymentIntentAttemptRecord> {
      const state: PaymentsPaymentIntentAttemptStatus = status === "awaiting_payment_method" ? "AWAITING_PAYMENT_METHOD" :
        status === "awaiting_next_action" ? "AWAITING_NEXT_ACTION" : status === "processing" ? "PROCESSING" :
        status === "succeeded" ? "SUCCEEDED" : "CANCELLED";
      return use(async (c) => {
        const q = await c.query<Row>(
          'UPDATE "PaymentIntentAttempt" SET "status"=$2,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1 AND "paymentIntentId" IS NOT NULL RETURNING *',
          [id,state]);
        if (q.rowCount !== 1) throw new Error("Payment Intent attempt state update conflict.");
        return record(q.rows[0]!);
      });
    },

  });
}

import { Client } from "pg";
import type { CommerceOrderSourceSnapshot } from "../../contracts/order-source-lookup.contract";
import type { CommerceOrderSourceLookupRepository } from "../../logic/order-source-lookup-repository";

interface OrderSourceRow {
  id: string;
  number: string;
  accountId: string;
  sourceReference: string;
  fulfillmentMode: "ACCOUNT_ENTITLEMENT" | "CLAIM_CODE";
  status: "PENDING" | "PAID" | "CANCELLED" | "REFUNDED" | "PARTIALLY_REFUNDED";
  currency: string;
  totalMinor: number;
  paidAt: Date | string | null;
  createdAt: Date | string;
}

export function createPostgresCommerceOrderSourceLookupRepository(
  connectionString: string,
): CommerceOrderSourceLookupRepository {
  const normalized = connectionString.trim();
  if (!normalized) throw new Error("Commerce PostgreSQL connection string is required.");

  return Object.freeze({
    async findBySourceReference(sourceReference: string) {
      const client = new Client({ connectionString: normalized });
      await client.connect();
      try {
        const result = await client.query<OrderSourceRow>(
          `SELECT "id", "number", "accountId", "sourceReference", "fulfillmentMode",
                  "status", "currency", "totalMinor", "paidAt", "createdAt"
             FROM "Order"
            WHERE "sourceReference" = $1
            LIMIT 1`,
          [sourceReference],
        );
        const row = result.rows[0];
        if (!row) return null;
        return Object.freeze({
          orderId: row.id,
          orderNumber: row.number,
          accountId: row.accountId,
          sourceReference: row.sourceReference,
          fulfillmentMode: row.fulfillmentMode,
          status: row.status,
          currency: row.currency,
          totalMinor: Number(row.totalMinor),
          paidAt: row.paidAt ? new Date(row.paidAt) : null,
          createdAt: new Date(row.createdAt),
        } satisfies CommerceOrderSourceSnapshot);
      } finally {
        await client.end();
      }
    },
  });
}

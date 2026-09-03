import { Client } from "pg";
import type {
  CommerceSettlementOrderItem,
  CommerceSettlementReactionRepository,
  CommerceSettlementRecord,
} from "../../logic/settlement-reaction-repository";

type SettlementInput = Parameters<CommerceSettlementReactionRepository["settle"]>[0];

interface OrderRow {
  id: string;
  accountId: string;
  status: "PENDING" | "PAID" | "CANCELLED" | "REFUNDED" | "PARTIALLY_REFUNDED";
  currency: string;
  totalMinor: number;
}

interface InvoiceRow {
  id: string;
  status: "DRAFT" | "FINAL" | "VOID";
}

interface ItemRow {
  id: string;
  productId: string;
  editionId: string | null;
  quantity: number;
  entitlementSnapshot: unknown;
  policySnapshot: unknown;
}

function mapRecord(order: OrderRow, invoice: InvoiceRow, items: readonly ItemRow[]): CommerceSettlementRecord {
  return Object.freeze({
    orderId: order.id,
    invoiceId: invoice.id,
    accountId: order.accountId,
    amountMinor: Number(order.totalMinor),
    currency: order.currency,
    orderStatus: "PAID" as const,
    invoiceStatus: "FINAL" as const,
    items: Object.freeze(items.map((item): CommerceSettlementOrderItem => Object.freeze({
      orderItemId: item.id,
      productId: item.productId,
      editionId: item.editionId,
      quantity: Number(item.quantity),
      entitlementSnapshot: item.entitlementSnapshot,
      policySnapshot: item.policySnapshot,
    }))),
  });
}

export function createPostgresCommerceSettlementReactionRepository(
  connectionString: string,
): CommerceSettlementReactionRepository {
  const normalized = connectionString.trim();
  if (!normalized) throw new Error("Commerce PostgreSQL connection string is required.");

  return Object.freeze({
    async settle(input: SettlementInput) {
      const client = new Client({ connectionString: normalized });
      await client.connect();
      try {
        await client.query("BEGIN");
        const orderResult = await client.query<OrderRow>(
          `SELECT "id", "accountId", "status", "currency", "totalMinor"
             FROM "Order"
            WHERE "id" = $1
            FOR UPDATE`,
          [input.orderId],
        );
        if (orderResult.rowCount !== 1) {
          await client.query("ROLLBACK");
          return { status: "REJECTED" as const, code: "ORDER_NOT_FOUND" as const };
        }
        const order = orderResult.rows[0]!;
        if (Number(order.totalMinor) !== input.expectedAmountMinor || order.currency !== input.expectedCurrency) {
          await client.query("ROLLBACK");
          return { status: "REJECTED" as const, code: "SETTLEMENT_MISMATCH" as const };
        }
        if (order.status !== "PENDING" && order.status !== "PAID") {
          await client.query("ROLLBACK");
          return { status: "REJECTED" as const, code: "ORDER_NOT_SETTLEABLE" as const };
        }

        const invoiceResult = await client.query<InvoiceRow>(
          `SELECT "id", "status" FROM "Invoice" WHERE "orderId" = $1 FOR UPDATE`,
          [order.id],
        );
        if (invoiceResult.rowCount !== 1) throw new Error("Commerce invoice is missing for settlement.");
        const invoice = invoiceResult.rows[0]!;
        if (
          (order.status === "PENDING" && invoice.status !== "DRAFT") ||
          (order.status === "PAID" && invoice.status !== "FINAL")
        ) {
          await client.query("ROLLBACK");
          return { status: "REJECTED" as const, code: "ORDER_NOT_SETTLEABLE" as const };
        }

        if (order.status === "PENDING") {
          await client.query(
            `UPDATE "Order" SET "status" = 'PAID', "paidAt" = $2 WHERE "id" = $1`,
            [order.id, input.settledAt],
          );
          await client.query(
            `UPDATE "Invoice" SET "status" = 'FINAL', "issuedAt" = $2 WHERE "id" = $1`,
            [invoice.id, input.settledAt],
          );
        }

        const itemsResult = await client.query<ItemRow>(
          `SELECT "id", "productId", "editionId", "quantity", "entitlementSnapshot", "policySnapshot"
             FROM "OrderItem"
            WHERE "orderId" = $1
            ORDER BY "id"`,
          [order.id],
        );
        await client.query("COMMIT");
        return {
          status: "SETTLED" as const,
          value: mapRecord({ ...order, status: "PAID" }, { ...invoice, status: "FINAL" }, itemsResult.rows),
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

import { Client } from "pg";
import type {
  CommerceZeroPaymentFulfillmentRepository,
  CommerceZeroPaymentOrderItem,
  CommerceZeroPaymentRecord,
} from "../../logic/zero-payment-fulfillment-repository";

type FulfillmentInput = Parameters<CommerceZeroPaymentFulfillmentRepository["fulfill"]>[0];

interface OrderRow {
  id: string;
  accountId: string;
  status: "PENDING" | "PAID" | "CANCELLED" | "REFUNDED" | "PARTIALLY_REFUNDED";
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

function mapRecord(order: OrderRow, invoice: InvoiceRow, items: readonly ItemRow[]): CommerceZeroPaymentRecord {
  return Object.freeze({
    orderId: order.id,
    invoiceId: invoice.id,
    accountId: order.accountId,
    orderStatus: "PAID" as const,
    invoiceStatus: "FINAL" as const,
    items: Object.freeze(
      items.map((item): CommerceZeroPaymentOrderItem =>
        Object.freeze({
          orderItemId: item.id,
          productId: item.productId,
          editionId: item.editionId,
          quantity: Number(item.quantity),
          entitlementSnapshot: item.entitlementSnapshot,
          policySnapshot: item.policySnapshot,
        }),
      ),
    ),
  });
}

export function createPostgresCommerceZeroPaymentFulfillmentRepository(
  connectionString: string,
): CommerceZeroPaymentFulfillmentRepository {
  const normalized = connectionString.trim();
  if (!normalized) throw new Error("Commerce PostgreSQL connection string is required.");

  return Object.freeze({
    async fulfill(input: FulfillmentInput) {
      const client = new Client({ connectionString: normalized });
      await client.connect();
      try {
        await client.query("BEGIN");
        const orderResult = await client.query<OrderRow>(
          `SELECT "id", "accountId", "status", "totalMinor"
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
        if (Number(order.totalMinor) !== 0) {
          await client.query("ROLLBACK");
          return { status: "REJECTED" as const, code: "ORDER_NOT_ZERO_TOTAL" as const };
        }
        if (order.status !== "PENDING" && order.status !== "PAID") {
          await client.query("ROLLBACK");
          return { status: "REJECTED" as const, code: "ORDER_NOT_FULFILLABLE" as const };
        }

        const invoiceResult = await client.query<InvoiceRow>(
          `SELECT "id", "status" FROM "Invoice" WHERE "orderId" = $1 FOR UPDATE`,
          [order.id],
        );
        if (invoiceResult.rowCount !== 1) throw new Error("Commerce invoice is missing for zero-payment fulfillment.");
        const invoice = invoiceResult.rows[0]!;

        if (
          (order.status === "PENDING" && invoice.status !== "DRAFT") ||
          (order.status === "PAID" && invoice.status !== "FINAL")
        ) {
          await client.query("ROLLBACK");
          return { status: "REJECTED" as const, code: "ORDER_NOT_FULFILLABLE" as const };
        }

        if (order.status === "PENDING") {
          await client.query(
            `UPDATE "Order" SET "status" = 'PAID', "paidAt" = $2 WHERE "id" = $1`,
            [order.id, input.fulfilledAt],
          );
          await client.query(
            `UPDATE "Invoice" SET "status" = 'FINAL', "issuedAt" = $2 WHERE "id" = $1`,
            [invoice.id, input.fulfilledAt],
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
          status: "FULFILLED" as const,
          value: mapRecord(
            { ...order, status: "PAID" },
            { ...invoice, status: "FINAL" },
            itemsResult.rows,
          ),
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

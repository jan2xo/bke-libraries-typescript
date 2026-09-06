import { Client } from "pg";
import type {
  CommerceOrderItemPolicyLookupCapability,
  CommerceOrderItemPolicyLookupResult,
} from "../../contracts/order-item-policy-lookup.contract";

export function createPostgresCommerceOrderItemPolicyLookupCapability(
  connectionString: string,
): CommerceOrderItemPolicyLookupCapability {
  const normalized = connectionString.trim();
  if (!normalized) throw new Error("Commerce PostgreSQL connection string is required.");

  const capability: CommerceOrderItemPolicyLookupCapability = {
    async findByOrderItemId(orderItemId: string): Promise<CommerceOrderItemPolicyLookupResult> {
      if (!orderItemId) return { status: "FAILED", code: "INVALID_INPUT" };
      const client = new Client({ connectionString: normalized });
      try {
        await client.connect();
        const result = await client.query<{ orderItemId: string; policyId: string }>(
          `SELECT "id" AS "orderItemId", "policyId"
             FROM "OrderItem"
            WHERE "id" = $1`,
          [orderItemId],
        );
        if (result.rowCount !== 1) return { status: "NOT_FOUND" };
        return { status: "FOUND", value: Object.freeze(result.rows[0]!) };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      } finally {
        await client.end().catch(() => undefined);
      }
    },
  };
  return Object.freeze(capability);
}

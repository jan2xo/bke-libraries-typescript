import { Client } from "pg";
import type { CommerceSubscriptionStatusSnapshot } from "../../contracts/subscription-status-lookup.contract";
import type { CommerceSubscriptionStatusLookupRepository } from "../../logic/subscription-status-lookup-repository";
export function createPostgresCommerceSubscriptionStatusLookupRepository(connectionString: string): CommerceSubscriptionStatusLookupRepository {
  const normalized = connectionString.trim(); if (!normalized) throw new Error("Commerce PostgreSQL connection string is required.");
  return Object.freeze({ async findById(subscriptionId: string): Promise<CommerceSubscriptionStatusSnapshot | null> { const client = new Client({ connectionString: normalized }); await client.connect(); try { const result = await client.query<CommerceSubscriptionStatusSnapshot>(`SELECT "id", "status", "currentPeriodStart", "currentPeriodEnd" FROM "Subscription" WHERE "id" = $1 LIMIT 1`, [subscriptionId]); return result.rows[0] ?? null; } finally { await client.end(); } } });
}

import { Client } from "pg";
import type {
  CommercePublicPromotionPreviewRepository,
  CommercePublicPromotionPreviewRequest,
} from "../../logic/public-promotion-preview-repository";

interface PromotionRow {
  readonly id: string;
  readonly name: string;
  readonly discountBps: number;
  readonly discountedBillingCycles: number | null;
}

export function createPostgresCommercePublicPromotionPreviewRepository(
  connectionString: string,
): CommercePublicPromotionPreviewRepository {
  const normalized = connectionString.trim();
  if (!normalized) throw new Error("Commerce PostgreSQL connection string is required.");

  return Object.freeze({
    async findBest(input: CommercePublicPromotionPreviewRequest) {
      const client = new Client({ connectionString: normalized });
      await client.connect();
      try {
        const result = await client.query<PromotionRow>(
          `SELECT "id", "name", "discountBps", "discountedBillingCycles"
             FROM "DiscountOffer"
            WHERE "type" = 'GENERAL_PROMOTION'
              AND "status" = 'ACTIVE'
              AND "codeNormalized" IS NULL
              AND "customerAccountId" IS NULL
              AND "revokedAt" IS NULL
              AND "startsAt" <= $1
              AND ("endsAt" IS NULL OR "endsAt" > $1)
              AND ("productId" IS NULL OR "productId" = $2)
              AND ("editionId" IS NULL OR "editionId" = $3)
              AND ("purchasePlanId" IS NULL OR "purchasePlanId" = $4)
              AND ("discountedBillingCycles" IS NULL OR $5 = 'MONTHLY')
            ORDER BY "discountBps" DESC, "createdAt" ASC
            LIMIT 1`,
          [input.now, input.productId, input.editionId, input.purchasePlanId, input.planType],
        );
        const row = result.rows[0];
        return row
          ? Object.freeze({
              offerId: row.id,
              name: row.name,
              discountBps: Number(row.discountBps),
              discountedBillingCycles:
                row.discountedBillingCycles === null ? null : Number(row.discountedBillingCycles),
            })
          : null;
      } finally {
        await client.end();
      }
    },
  });
}

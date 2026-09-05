import { Client } from "pg";
import type { LicensingLicenseSnapshot } from "../../contracts/license.contract";
import type { LicensingLicenseLookup } from "../../contracts/license-lookup.contract";

type LicenseRow = LicensingLicenseSnapshot;

export function createPostgresLicensingLicenseLookupRepository(
  connectionString: string,
): LicensingLicenseLookup {
  const normalized = connectionString.trim();
  if (!normalized) throw new Error("Licensing PostgreSQL connection string is required.");

  return Object.freeze({
    async findByKeyHash(input: { readonly licenseKeyHash: string }): Promise<LicensingLicenseSnapshot | null> {
      const client = new Client({ connectionString: normalized });
      await client.connect();
      try {
        const result = await client.query<LicenseRow>(
          `SELECT "id", "publicId", "keyLastFour", "keyRevealedAt",
                  "accountId", "orderId", "orderItemId", "productId", "editionId",
                  "purchasePlanId", "subscriptionId", "status", "maxSeats",
                  "maxDevicesPerSeat", "expiresAt", "createdAt"
             FROM "License"
            WHERE "keyHash" = $1`,
          [input.licenseKeyHash],
        );
        return result.rows[0] ?? null;
      } finally {
        await client.end();
      }
    },
  });
}

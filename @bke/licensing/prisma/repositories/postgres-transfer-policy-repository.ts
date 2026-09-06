import { Client } from "pg";
import type {
  LicensingTransferPolicyCapability,
  LicensingTransferPolicyLookupResult,
} from "../../contracts/transfer-policy.contract";

export function createPostgresLicensingTransferPolicyCapability(
  connectionString: string,
): LicensingTransferPolicyCapability {
  const normalized = connectionString.trim();
  if (!normalized) throw new Error("Licensing PostgreSQL connection string is required.");

  const capability: LicensingTransferPolicyCapability = {
    async findByPolicyId(policyId: string): Promise<LicensingTransferPolicyLookupResult> {
      if (!policyId) return { status: "FAILED", code: "INVALID_INPUT" };
      const client = new Client({ connectionString: normalized });
      try {
        await client.connect();
        const result = await client.query<{ policyId: string; transferable: boolean }>(
          `SELECT "id" AS "policyId", "transferable"
             FROM "LicensePolicy"
            WHERE "id" = $1`,
          [policyId],
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

import { Client } from "pg";
import type {
  EntitlementsDurableRightRevocationSnapshot,
  EntitlementsRevokeDurableRightInput,
} from "../../contracts/durable-right-revocation.contract";
import type {
  EntitlementsDurableRightRevocationRepository,
  EntitlementsDurableRightRevocationRepositoryResult,
} from "../../logic/durable-right-revocation-repository";

type EntitlementLifecycleRow = {
  id: string;
  status: "ACTIVE" | "REVOKED";
  revokedAt: Date | null;
  revocationReference: string | null;
  revocationSnapshot: unknown;
  matches?: boolean;
};

function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function snapshot(row: EntitlementLifecycleRow): EntitlementsDurableRightRevocationSnapshot {
  if (
    row.status !== "REVOKED" ||
    !row.revokedAt ||
    !row.revocationReference
  ) {
    throw new Error("Invalid revoked Entitlement lifecycle row.");
  }

  return {
    entitlementId: row.id,
    status: "REVOKED",
    revocationReference: row.revocationReference,
    revocationSnapshot: row.revocationSnapshot,
    revokedAt: new Date(row.revokedAt.getTime()),
  };
}

export function createPostgresEntitlementsDurableRightRevocationRepository(
  connectionString: string,
): EntitlementsDurableRightRevocationRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Entitlements PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async revoke(
      input: EntitlementsRevokeDurableRightInput,
    ): Promise<EntitlementsDurableRightRevocationRepositoryResult> {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        await client.query("BEGIN");
        const found = await client.query<EntitlementLifecycleRow>(
          `SELECT "id", "status", "revokedAt", "revocationReference", "revocationSnapshot",
                  (
                    "status" = 'REVOKED'
                    AND "revocationReference" = $2
                    AND "revokedAt" = $3::timestamp
                    AND "revocationSnapshot" = $4::jsonb
                  ) AS "matches"
             FROM "Entitlement"
            WHERE "id" = $1
            FOR UPDATE`,
          [
            input.entitlementId,
            input.revocationReference,
            input.revokedAt,
            json(input.revocationSnapshot),
          ],
        );

        const current = found.rows[0];
        if (!current) {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "NOT_FOUND" };
        }

        if (current.status === "REVOKED") {
          await client.query("COMMIT");
          return current.matches
            ? { status: "EXISTING", value: snapshot(current) }
            : { status: "REJECTED", code: "REVOCATION_CONFLICT" };
        }

        const updated = await client.query<EntitlementLifecycleRow>(
          `UPDATE "Entitlement"
              SET "status" = 'REVOKED',
                  "revokedAt" = $2,
                  "revocationReference" = $3,
                  "revocationSnapshot" = $4::jsonb
            WHERE "id" = $1
              AND "status" = 'ACTIVE'
          RETURNING "id", "status", "revokedAt", "revocationReference", "revocationSnapshot"`,
          [
            input.entitlementId,
            input.revokedAt,
            input.revocationReference,
            json(input.revocationSnapshot),
          ],
        );

        const revoked = updated.rows[0];
        if (!revoked) throw new Error("Entitlement lifecycle changed while locked.");
        await client.query("COMMIT");
        return { status: "REVOKED", value: snapshot(revoked) };
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Preserve the original persistence failure.
        }
        throw error;
      } finally {
        await client.end();
      }
    },
  });
}

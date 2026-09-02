import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type {
  EntitlementsDurableRightSnapshot,
  EntitlementsGrantDurableRightInput,
} from "../../contracts/durable-right-grant.contract";
import type {
  EntitlementsDurableRightGrantRepository,
  EntitlementsDurableRightGrantRepositoryResult,
} from "../../logic/durable-right-grant-repository";

type EntitlementRow = {
  id: string;
  subjectId: string;
  resourceId: string;
  sourceReference: string;
  status: "ACTIVE";
  quantity: number;
  scopeSnapshot: unknown;
  grantSnapshot: unknown;
  validFrom: Date;
  validUntil: Date | null;
  createdAt: Date;
};

type ExistingEntitlementRow = EntitlementRow & { matches: boolean };

function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function copyDate(value: Date): Date {
  return new Date(value.getTime());
}

function snapshot(row: EntitlementRow): EntitlementsDurableRightSnapshot {
  return {
    entitlementId: row.id,
    subjectId: row.subjectId,
    resourceId: row.resourceId,
    sourceReference: row.sourceReference,
    status: row.status,
    quantity: row.quantity,
    scopeSnapshot: row.scopeSnapshot,
    grantSnapshot: row.grantSnapshot,
    validFrom: copyDate(row.validFrom),
    validUntil: row.validUntil ? copyDate(row.validUntil) : null,
    createdAt: copyDate(row.createdAt),
  };
}

export function createPostgresEntitlementsDurableRightGrantRepository(
  connectionString: string,
): EntitlementsDurableRightGrantRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Entitlements PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async grant(
      input: EntitlementsGrantDurableRightInput,
    ): Promise<EntitlementsDurableRightGrantRepositoryResult> {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        const inserted = await client.query<EntitlementRow>(
          `INSERT INTO "Entitlement" (
             "id", "subjectId", "resourceId", "sourceReference", "status", "quantity",
             "scopeSnapshot", "grantSnapshot", "validFrom", "validUntil"
           ) VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6::jsonb, $7::jsonb, $8, $9)
           ON CONFLICT ("sourceReference") DO NOTHING
           RETURNING "id", "subjectId", "resourceId", "sourceReference", "status", "quantity",
                     "scopeSnapshot", "grantSnapshot", "validFrom", "validUntil", "createdAt"`,
          [
            randomUUID(),
            input.subjectId,
            input.resourceId,
            input.sourceReference,
            input.quantity,
            json(input.scopeSnapshot),
            json(input.grantSnapshot),
            input.validFrom,
            input.validUntil ?? null,
          ],
        );

        const created = inserted.rows[0];
        if (created) return { status: "GRANTED", value: snapshot(created) };

        const existing = await client.query<ExistingEntitlementRow>(
          `SELECT "id", "subjectId", "resourceId", "sourceReference", "status", "quantity",
                  "scopeSnapshot", "grantSnapshot", "validFrom", "validUntil", "createdAt",
                  (
                    "subjectId" = $2 AND
                    "resourceId" = $3 AND
                    "quantity" = $4 AND
                    "scopeSnapshot" = $5::jsonb AND
                    "grantSnapshot" = $6::jsonb AND
                    "validFrom" = $7::timestamp AND
                    "validUntil" IS NOT DISTINCT FROM $8::timestamp
                  ) AS "matches"
             FROM "Entitlement"
            WHERE "sourceReference" = $1`,
          [
            input.sourceReference,
            input.subjectId,
            input.resourceId,
            input.quantity,
            json(input.scopeSnapshot),
            json(input.grantSnapshot),
            input.validFrom,
            input.validUntil ?? null,
          ],
        );

        const row = existing.rows[0];
        if (!row) throw new Error("Entitlements source reference disappeared after conflict.");
        if (!row.matches) return { status: "REJECTED", code: "SOURCE_CONFLICT" };
        return { status: "EXISTING", value: snapshot(row) };
      } finally {
        await client.end();
      }
    },
  });
}

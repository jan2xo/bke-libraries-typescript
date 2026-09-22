import { Client } from "pg";
import type {
  EntitlementsDurableRightSnapshot,
  EntitlementsDurableRightStatus,
} from "../../contracts/durable-right-grant.contract";
import type {
  EntitlementsDurableRightLifecycleRepository,
  EntitlementsDurableRightLifecycleRepositoryResult,
} from "../../logic/durable-right-lifecycle-repository";

type EntitlementRow = {
  id: string;
  subjectId: string;
  resourceId: string;
  sourceReference: string;
  status: EntitlementsDurableRightStatus;
  quantity: number;
  scopeSnapshot: unknown;
  grantSnapshot: unknown;
  validFrom: Date;
  validUntil: Date | null;
  statusChangedAt: Date | null;
  statusReason: string | null;
  createdAt: Date;
};

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
    quantity: Number(row.quantity),
    scopeSnapshot: row.scopeSnapshot,
    grantSnapshot: row.grantSnapshot,
    validFrom: copyDate(row.validFrom),
    validUntil: row.validUntil ? copyDate(row.validUntil) : null,
    statusChangedAt: row.statusChangedAt ? copyDate(row.statusChangedAt) : null,
    statusReason: row.statusReason,
    createdAt: copyDate(row.createdAt),
  };
}

const returning = `
  "id", "subjectId", "resourceId", "sourceReference", "status", "quantity",
  "scopeSnapshot", "grantSnapshot", "validFrom", "validUntil",
  "statusChangedAt", "statusReason", "createdAt"
`;

export function createPostgresEntitlementsDurableRightLifecycleRepository(
  connectionString: string,
): EntitlementsDurableRightLifecycleRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Entitlements PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async transition(input): Promise<EntitlementsDurableRightLifecycleRepositoryResult> {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        await client.query("BEGIN");

        const currentResult = await client.query<EntitlementRow>(
          `SELECT ${returning}
             FROM "Entitlement"
            WHERE "id" = $1
            FOR UPDATE`,
          [input.entitlementId],
        );
        const current = currentResult.rows[0];
        if (!current) {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "NOT_FOUND" };
        }

        if (current.status === input.targetStatus) {
          await client.query("COMMIT");
          return { status: "UNCHANGED", value: snapshot(current) };
        }

        if (!input.allowedFromStatuses.includes(current.status)) {
          await client.query("ROLLBACK");
          return {
            status: "REJECTED",
            code: "INVALID_TRANSITION",
            currentStatus: current.status,
          };
        }

        const updatedResult = await client.query<EntitlementRow>(
          `UPDATE "Entitlement"
              SET "status" = $2::"EntitlementStatus",
                  "statusChangedAt" = $3,
                  "statusReason" = $4
            WHERE "id" = $1
            RETURNING ${returning}`,
          [input.entitlementId, input.targetStatus, input.changedAt, input.reason],
        );
        const updated = updatedResult.rows[0];
        if (!updated) throw new Error("Entitlements lifecycle update disappeared.");

        await client.query("COMMIT");
        return { status: "UPDATED", value: snapshot(updated) };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        await client.end();
      }
    },
  });
}

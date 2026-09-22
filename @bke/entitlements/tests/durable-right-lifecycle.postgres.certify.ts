import { Client } from "pg";
import { createEntitlementsDurableRightGrantCapability } from "../logic/durable-right-grant";
import { createEntitlementsDurableRightLifecycleCapability } from "../logic/durable-right-lifecycle";
import { createPostgresEntitlementsDurableRightGrantRepository } from "../prisma/repositories/postgres-durable-right-grant-repository";
import { createPostgresEntitlementsDurableRightLifecycleRepository } from "../prisma/repositories/postgres-durable-right-lifecycle-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Entitlements lifecycle certification.");

const grants = createEntitlementsDurableRightGrantCapability(
  createPostgresEntitlementsDurableRightGrantRepository(connectionString),
);
const lifecycle = createEntitlementsDurableRightLifecycleCapability(
  createPostgresEntitlementsDurableRightLifecycleRepository(connectionString),
);

const granted = await grants.grant({
  subjectId: "account-lifecycle-cert",
  resourceId: "product-lifecycle-cert",
  sourceReference: "commerce:order-item:lifecycle-cert",
  quantity: 1,
  scopeSnapshot: { editionId: "edition-lifecycle-cert" },
  grantSnapshot: { basis: "PAID_ORDER" },
  validFrom: new Date("2026-09-01T00:00:00.000Z"),
});
if (granted.status !== "GRANTED") throw new Error(`Expected GRANTED: ${JSON.stringify(granted)}`);

const entitlementId = granted.value.entitlementId;
const suspendedAt = new Date("2026-09-23T00:01:00.000Z");
const suspended = await lifecycle.transition({
  entitlementId,
  targetStatus: "SUSPENDED",
  reason: "PAYMENT_REVIEW",
  changedAt: suspendedAt,
});
if (
  suspended.status !== "UPDATED" ||
  suspended.value.status !== "SUSPENDED" ||
  suspended.value.statusReason !== "PAYMENT_REVIEW" ||
  suspended.value.statusChangedAt?.getTime() !== suspendedAt.getTime()
) {
  throw new Error(`Expected SUSPENDED: ${JSON.stringify(suspended)}`);
}

const suspendRetry = await lifecycle.transition({
  entitlementId,
  targetStatus: "SUSPENDED",
  reason: "DIFFERENT_REASON_MUST_NOT_OVERWRITE",
  changedAt: new Date("2026-09-23T00:02:00.000Z"),
});
if (
  suspendRetry.status !== "UNCHANGED" ||
  suspendRetry.value.statusReason !== "PAYMENT_REVIEW" ||
  suspendRetry.value.statusChangedAt?.getTime() !== suspendedAt.getTime()
) {
  throw new Error(`Expected idempotent SUSPENDED retry: ${JSON.stringify(suspendRetry)}`);
}

const reactivated = await lifecycle.transition({
  entitlementId,
  targetStatus: "ACTIVE",
  reason: "PAYMENT_REVIEW_CLEARED",
  changedAt: new Date("2026-09-23T00:03:00.000Z"),
});
if (reactivated.status !== "UPDATED" || reactivated.value.status !== "ACTIVE") {
  throw new Error(`Expected reactivation: ${JSON.stringify(reactivated)}`);
}

const revokedAt = new Date("2026-09-23T00:04:00.000Z");
const revoked = await lifecycle.transition({
  entitlementId,
  targetStatus: "REVOKED",
  reason: "PAYMENT_REFUNDED",
  changedAt: revokedAt,
});
if (
  revoked.status !== "UPDATED" ||
  revoked.value.status !== "REVOKED" ||
  revoked.value.statusReason !== "PAYMENT_REFUNDED"
) {
  throw new Error(`Expected REVOKED: ${JSON.stringify(revoked)}`);
}

const revokeRetry = await lifecycle.transition({
  entitlementId,
  targetStatus: "REVOKED",
  reason: "RETRY_MUST_NOT_OVERWRITE",
  changedAt: new Date("2026-09-23T00:05:00.000Z"),
});
if (
  revokeRetry.status !== "UNCHANGED" ||
  revokeRetry.value.statusReason !== "PAYMENT_REFUNDED" ||
  revokeRetry.value.statusChangedAt?.getTime() !== revokedAt.getTime()
) {
  throw new Error(`Expected idempotent REVOKED retry: ${JSON.stringify(revokeRetry)}`);
}

for (const targetStatus of ["ACTIVE", "SUSPENDED"] as const) {
  const forbidden = await lifecycle.transition({
    entitlementId,
    targetStatus,
    reason: "FORBIDDEN_REVERSAL",
    changedAt: new Date("2026-09-23T00:06:00.000Z"),
  });
  if (
    forbidden.status !== "REJECTED" ||
    forbidden.code !== "INVALID_TRANSITION" ||
    forbidden.currentStatus !== "REVOKED"
  ) {
    throw new Error(`Expected terminal REVOKED state: ${JSON.stringify(forbidden)}`);
  }
}

const missing = await lifecycle.transition({
  entitlementId: "missing-entitlement",
  targetStatus: "REVOKED",
  reason: "PAYMENT_REFUNDED",
  changedAt: new Date("2026-09-23T00:07:00.000Z"),
});
if (missing.status !== "REJECTED" || missing.code !== "NOT_FOUND") {
  throw new Error(`Expected NOT_FOUND: ${JSON.stringify(missing)}`);
}

const client = new Client({ connectionString });
await client.connect();
try {
  const row = await client.query<{
    status: string;
    statusReason: string | null;
    statusChangedAt: Date | null;
  }>(
    `SELECT "status"::text AS "status", "statusReason", "statusChangedAt"
       FROM "Entitlement"
      WHERE "id" = $1`,
    [entitlementId],
  );
  if (
    row.rows[0]?.status !== "REVOKED" ||
    row.rows[0]?.statusReason !== "PAYMENT_REFUNDED" ||
    row.rows[0]?.statusChangedAt?.getTime() !== revokedAt.getTime()
  ) {
    throw new Error(`Persisted lifecycle state drifted: ${JSON.stringify(row.rows[0])}`);
  }
} finally {
  await client.end();
}

console.log("Entitlements durable-right lifecycle GREEN: suspend/reactivate/revoke/terminal semantics certified");

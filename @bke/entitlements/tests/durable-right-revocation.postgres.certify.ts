import { Client } from "pg";
import { createEntitlementsDurableRightGrantCapability } from "../logic/durable-right-grant";
import { createEntitlementsDurableRightRevocationCapability } from "../logic/durable-right-revocation";
import { createPostgresEntitlementsDurableRightGrantRepository } from "../prisma/repositories/postgres-durable-right-grant-repository";
import { createPostgresEntitlementsDurableRightRevocationRepository } from "../prisma/repositories/postgres-durable-right-revocation-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Entitlements certification.");

const grants = createEntitlementsDurableRightGrantCapability(
  createPostgresEntitlementsDurableRightGrantRepository(connectionString),
);
const revocations = createEntitlementsDurableRightRevocationCapability(
  createPostgresEntitlementsDurableRightRevocationRepository(connectionString),
);

const sourceReference = "commerce:order-item:revocation-cert";
const granted = await grants.grant({
  subjectId: "account-revocation-cert",
  resourceId: "product-revocation-cert",
  sourceReference,
  quantity: 1,
  scopeSnapshot: { editionId: "edition-revocation-cert" },
  grantSnapshot: { basis: "PAID_ORDER", orderId: "order-revocation-cert" },
  validFrom: new Date("2026-09-23T00:00:00.000Z"),
  validUntil: null,
});
if (granted.status !== "GRANTED" && granted.status !== "EXISTING") {
  throw new Error(`Expected grant prerequisite, received ${JSON.stringify(granted)}`);
}

const input = {
  entitlementId: granted.value.entitlementId,
  revocationReference: "refund:provider:revocation-cert",
  revocationSnapshot: {
    reason: "REFUND_CONFIRMED",
    orderId: "order-revocation-cert",
    providerRefundId: "refund-revocation-cert",
  },
  revokedAt: new Date("2026-09-23T03:30:00.000Z"),
} as const;

const revoked = await revocations.revoke(input);
if (revoked.status !== "REVOKED") {
  throw new Error(`Expected REVOKED, received ${JSON.stringify(revoked)}`);
}

const repeated = await revocations.revoke(input);
if (repeated.status !== "EXISTING") {
  throw new Error(`Expected EXISTING revocation retry, received ${JSON.stringify(repeated)}`);
}

const conflict = await revocations.revoke({
  ...input,
  revocationReference: "refund:provider:different",
});
if (conflict.status !== "REJECTED" || conflict.code !== "REVOCATION_CONFLICT") {
  throw new Error(`Expected REVOCATION_CONFLICT, received ${JSON.stringify(conflict)}`);
}

const grantRetry = await grants.grant({
  subjectId: "account-revocation-cert",
  resourceId: "product-revocation-cert",
  sourceReference,
  quantity: 1,
  scopeSnapshot: { editionId: "edition-revocation-cert" },
  grantSnapshot: { basis: "PAID_ORDER", orderId: "order-revocation-cert" },
  validFrom: new Date("2026-09-23T00:00:00.000Z"),
  validUntil: null,
});
if (grantRetry.status !== "EXISTING" || grantRetry.value.status !== "REVOKED") {
  throw new Error("Grant retry must not reactivate a revoked Entitlement.");
}

const client = new Client({ connectionString });
await client.connect();
try {
  const row = await client.query<{
    status: string;
    revokedAt: Date | null;
    revocationReference: string | null;
    revocationSnapshot: unknown;
  }>(
    `SELECT "status", "revokedAt", "revocationReference", "revocationSnapshot"
       FROM "Entitlement"
      WHERE "id" = $1`,
    [granted.value.entitlementId],
  );
  const value = row.rows[0];
  if (
    value?.status !== "REVOKED" ||
    value.revokedAt?.getTime() !== input.revokedAt.getTime() ||
    value.revocationReference !== input.revocationReference ||
    JSON.stringify(value.revocationSnapshot) !== JSON.stringify(input.revocationSnapshot)
  ) {
    throw new Error("Revocation evidence was not persisted exactly.");
  }
} finally {
  await client.end();
}

console.log(`Entitlements revocation GREEN: ${granted.value.entitlementId}`);

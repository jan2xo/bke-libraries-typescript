import { Client } from "pg";
import { createEntitlementsDurableRightGrantCapability } from "../logic/durable-right-grant";
import { createPostgresEntitlementsDurableRightGrantRepository } from "../prisma/repositories/postgres-durable-right-grant-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Entitlements certification.");

const capability = createEntitlementsDurableRightGrantCapability(
  createPostgresEntitlementsDurableRightGrantRepository(connectionString),
);

const input = {
  subjectId: "account-cert-1",
  resourceId: "product-cert-1",
  sourceReference: "commerce:order-item:cert-1",
  quantity: 5,
  scopeSnapshot: { editionId: "edition-cert-1", seats: 5 },
  grantSnapshot: { basis: "PAID_ORDER", orderId: "order-cert-1", orderItemId: "item-cert-1" },
  validFrom: new Date("2026-09-02T00:00:00.000Z"),
  validUntil: new Date("2027-09-02T00:00:00.000Z"),
} as const;

const granted = await capability.grant(input);
if (granted.status !== "GRANTED") {
  throw new Error(`Expected GRANTED, received ${JSON.stringify(granted)}`);
}
if (granted.value.status !== "ACTIVE" || granted.value.quantity !== 5) {
  throw new Error("Granted Entitlement did not preserve durable-right state.");
}

const repeated = await capability.grant(input);
if (repeated.status !== "EXISTING") {
  throw new Error(`Expected EXISTING idempotent result, received ${JSON.stringify(repeated)}`);
}
if (repeated.value.entitlementId !== granted.value.entitlementId) {
  throw new Error("Idempotent grant changed Entitlement identity.");
}

const conflict = await capability.grant({ ...input, quantity: 6 });
if (conflict.status !== "REJECTED" || conflict.code !== "SOURCE_CONFLICT") {
  throw new Error(`Expected SOURCE_CONFLICT, received ${JSON.stringify(conflict)}`);
}

const client = new Client({ connectionString });
await client.connect();
try {
  const count = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS "count" FROM "Entitlement" WHERE "sourceReference" = $1`,
    [input.sourceReference],
  );
  if (count.rows[0]?.count !== "1") {
    throw new Error("Entitlements idempotency allowed duplicate durable rights.");
  }
} finally {
  await client.end();
}

console.log(
  `Entitlements durable-right grant GREEN: ${granted.value.entitlementId}; idempotent source=${input.sourceReference}`,
);

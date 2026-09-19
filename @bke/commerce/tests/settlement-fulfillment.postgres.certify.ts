import { Client } from "pg";
import { createCommerceSettlementFulfillmentCapability } from "../logic/settlement-fulfillment";
import { createPostgresCommerceSettlementFulfillmentRepository } from "../prisma/repositories/postgres-settlement-fulfillment-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for claimable settlement certification.");

const client = new Client({ connectionString });
await client.connect();
const settledAt = new Date("2026-09-19T00:10:00.000Z");

async function seed(orderId: string, mode: "ACCOUNT_ENTITLEMENT" | "CLAIM_CODE") {
  await client.query(
    `INSERT INTO "Order"
       ("id", "number", "accountId", "fulfillmentMode", "status", "currency",
        "subtotalMinor", "taxMinor", "totalMinor", "billingSnapshot")
     VALUES ($1, $2, 'account-claim-cert', $3::"CommerceFulfillmentMode", 'PENDING',
             'PHP', 1600, 0, 1600, '{}'::jsonb)`,
    [orderId, `NUMBER-${orderId}`, mode],
  );
  await client.query(
    `INSERT INTO "OrderItem" (
       "id", "orderId", "productId", "priceId", "policyId", "productName", "priceName",
       "quantity", "unitAmountMinor", "totalMinor", "billingType", "policySnapshot",
       "editionId", "purchasePlanId", "entitlementSnapshot"
     ) VALUES (
       $1, $2, 'product-claim-cert', 'price-claim-cert', 'policy-claim-cert',
       'Render Dock', 'Perpetual', 2, 800, 1600, 'ONE_TIME', '{"updatePolicy":"LIFETIME"}'::jsonb,
       'edition-claim-cert', 'plan-claim-cert', '{"editionId":"edition-claim-cert"}'::jsonb
     )`,
    [`item-${orderId}`, orderId],
  );
  await client.query(
    `INSERT INTO "Invoice"
       ("id", "number", "orderId", "status", "customerSnapshot", "currency",
        "subtotalMinor", "taxMinor", "totalMinor")
     VALUES ($1, $2, $3, 'DRAFT', '{}'::jsonb, 'PHP', 1600, 0, 1600)`,
    [`invoice-${orderId}`, `INV-${orderId}`, orderId],
  );
}

function capabilityFor(orderId: string) {
  let entitlementCalls = 0;
  let claimCalls = 0;
  const capability = createCommerceSettlementFulfillmentCapability({
    payments: {
      async reconcile() {
        return {
          status: "SETTLED" as const,
          value: {
            settlementFactId: `fact-${orderId}`,
            commercialReference: orderId,
            amountMinor: 1600,
            currency: "PHP",
            settledAt,
          },
        };
      },
    },
    repository: createPostgresCommerceSettlementFulfillmentRepository(connectionString!),
    entitlements: {
      async grant(input) {
        entitlementCalls += 1;
        if (input.subjectId !== "account-claim-cert" || input.quantity !== 2) {
          throw new Error(`Unexpected direct entitlement input: ${JSON.stringify(input)}`);
        }
        return { status: "GRANTED" as const };
      },
    },
    claimUnits: {
      async issue(input) {
        claimCalls += 1;
        if (
          input.purchaserAccountId !== "account-claim-cert" ||
          input.purchasePlanId !== "plan-claim-cert" ||
          input.quantity !== 2
        ) {
          throw new Error(`Unexpected claim-unit input: ${JSON.stringify(input)}`);
        }
        return { status: "ISSUED" as const, unitCount: input.quantity };
      },
    },
  });
  return { capability, entitlementCalls: () => entitlementCalls, claimCalls: () => claimCalls };
}

try {
  await seed("claimable-direct", "ACCOUNT_ENTITLEMENT");
  const direct = capabilityFor("claimable-direct");
  const directResult = await direct.capability.react({
    providerEventRecordId: "event-direct",
    expectedLivemode: false,
  });
  if (
    directResult.status !== "FULFILLED" ||
    directResult.value.fulfillmentMode !== "ACCOUNT_ENTITLEMENT" ||
    directResult.value.entitlementCount !== 1 ||
    directResult.value.claimUnitCount !== 0 ||
    direct.entitlementCalls() !== 1 ||
    direct.claimCalls() !== 0
  ) {
    throw new Error(`Direct settlement routing drifted: ${JSON.stringify(directResult)}`);
  }

  await seed("claimable-code", "CLAIM_CODE");
  const claim = capabilityFor("claimable-code");
  const claimResult = await claim.capability.react({
    providerEventRecordId: "event-claim",
    expectedLivemode: false,
  });
  if (
    claimResult.status !== "FULFILLED" ||
    claimResult.value.fulfillmentMode !== "CLAIM_CODE" ||
    claimResult.value.entitlementCount !== 0 ||
    claimResult.value.claimUnitCount !== 2 ||
    claim.entitlementCalls() !== 0 ||
    claim.claimCalls() !== 1
  ) {
    throw new Error(`Claim settlement routing drifted: ${JSON.stringify(claimResult)}`);
  }

  const persisted = await client.query<{ mode: string; orderStatus: string; invoiceStatus: string }>(
    `SELECT o."fulfillmentMode"::text AS "mode", o."status"::text AS "orderStatus",
            i."status"::text AS "invoiceStatus"
       FROM "Order" o
       JOIN "Invoice" i ON i."orderId" = o."id"
      WHERE o."id" = 'claimable-code'`,
  );
  if (
    persisted.rows[0]?.mode !== "CLAIM_CODE" ||
    persisted.rows[0]?.orderStatus !== "PAID" ||
    persisted.rows[0]?.invoiceStatus !== "FINAL"
  ) {
    throw new Error(`Claim settlement persistence drifted: ${JSON.stringify(persisted.rows[0])}`);
  }

  console.log("Commerce claim-aware settlement PostgreSQL certification GREEN");
} finally {
  await client.end();
}

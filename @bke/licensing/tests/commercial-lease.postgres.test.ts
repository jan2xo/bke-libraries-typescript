import { generateKeyPairSync } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CommercialLicenseContext } from "../contracts/commercial-lease.contract";
import { createCommercialLeaseCapability } from "../logic/commercial-lease";
import { createPostgresCommercialLeaseStore } from "../prisma/repositories/postgres-commercial-lease-store";
import { createPostgresCommercialSigningKeyProvider } from "../prisma/repositories/postgres-commercial-signing-key-provider";
import { createEd25519CommercialLeaseSigner } from "../providers/ed25519-commercial-lease-signer";

const connectionString = process.env.DATABASE_URL?.trim();
const integration = connectionString ? describe : describe.skip;
const now = new Date("2026-09-05T00:00:00.000Z");
let client: Client | null = null;
let privatePem = "";

const context: CommercialLicenseContext = {
  licenseId: "commercial-license-1",
  accountId: "account-1",
  licenseActive: true,
  accountActive: true,
  subscriptionActive: true,
  versionAccepted: true,
  minSupportedVersion: "1.0.0",
  policy: {
    maxDevices: 1,
    transferable: false,
    refreshAfterSeconds: 60,
    hardExpirySeconds: 300,
  },
  identity: {
    packageFamily: "bke-product",
    packageIdentityKey: "bke-product:desktop",
    releaseIdentityKey: "bke-product:1.0.0",
    contractVersion: "3",
    entitlements: ["BKE_SOFTWARE_ACCESS", "BKE_VERSION_1_0_0"],
  },
};

integration("commercial lease PostgreSQL runtime", () => {
  beforeAll(async () => {
    client = new Client({ connectionString: connectionString! });
    await client.connect();
    await client.query(`TRUNCATE TABLE "CommercialLeaseOperation", "LicenseLeaseRecord", "DeviceActivation", "CommercialSigningKey", "LicenseEvent", "LicenseAssignment", "License" CASCADE`);

    const pair = generateKeyPairSync("ed25519");
    privatePem = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();

    await client.query(
      `INSERT INTO "License"
        ("id", "publicId", "keyHash", "keyLastFour", "accountId", "orderId", "orderItemId", "productId", "status", "maxSeats", "maxDevicesPerSeat", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', 1, 1, $9)`,
      [
        context.licenseId,
        "public-license-1",
        "hash:license-key-1234567890",
        "7890",
        context.accountId,
        "order-1",
        "order-item-1",
        "product-1",
        now,
      ],
    );
    await client.query(
      `INSERT INTO "CommercialSigningKey"
        ("keyId", "publicKey", "privateKeyReference", "algorithm", "status", "activeFrom", "createdAt", "updatedAt")
       VALUES ('signing-key-1', 'test-public', 'secret://signing-key-1', 'Ed25519', 'ACTIVE', $1, $1, $1)`,
      [new Date("2026-09-01T00:00:00.000Z")],
    );
  });

  afterAll(async () => {
    await client?.end();
  });

  it("persists issuance and replays the idempotent result", async () => {
    let nextId = 0;
    const capability = createCommercialLeaseCapability({
      store: createPostgresCommercialLeaseStore(connectionString!),
      contexts: {
        async resolve(input) {
          return input.licenseKeyHash === "hash:license-key-1234567890" ? context : null;
        },
      },
      keys: createPostgresCommercialSigningKeyProvider(connectionString!),
      signer: createEd25519CommercialLeaseSigner({
        resolve(reference) {
          if (reference !== "secret://signing-key-1") throw new Error("TEST_SECRET_REFERENCE_MISMATCH");
          return privatePem;
        },
      }),
      hasher: { hash: (value) => `hash:${value}` },
      devices: { classify: () => ({ isVirtualMachine: false, isContainer: false }) },
      allowTransfer: false,
      id() {
        nextId += 1;
        return `postgres-generated-${nextId}`;
      },
    });

    const input = {
      licenseKey: "license-key-1234567890",
      clientVersion: "1.0.0",
      fingerprint: "fingerprint-123",
      installationId: "installation-123",
      idempotencyKey: "postgres-operation-123",
      now,
    } as const;

    const issued = await capability.issue(input);
    const replay = await capability.issue(input);

    expect(issued.operation).toMatchObject({ decision: "ISSUED", reasonCode: "INITIAL_ISSUE" });
    expect(replay.lease.tokenId).toBe(issued.lease.tokenId);
    expect(replay.token).toBe(issued.token);

    const activationCount = await client!.query<{ count: string }>(
      `SELECT COUNT(*)::text AS "count" FROM "DeviceActivation" WHERE "licenseId" = $1 AND "active" = true`,
      [context.licenseId],
    );
    const leaseCount = await client!.query<{ count: string }>(
      `SELECT COUNT(*)::text AS "count" FROM "LicenseLeaseRecord" WHERE "licenseId" = $1`,
      [context.licenseId],
    );
    const operation = await client!.query<{ status: string; resultLeaseId: string | null }>(
      `SELECT "status", "resultLeaseId" FROM "CommercialLeaseOperation" WHERE "operationId" = $1`,
      [input.idempotencyKey],
    );

    expect(activationCount.rows[0]?.count).toBe("1");
    expect(leaseCount.rows[0]?.count).toBe("1");
    expect(operation.rows[0]).toEqual({ status: "COMPLETED", resultLeaseId: issued.lease.tokenId });
  });
});

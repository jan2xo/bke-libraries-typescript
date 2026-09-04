import { createHash, generateKeyPairSync } from "node:crypto";
import { Client } from "pg";
import { beforeEach, describe, expect, it } from "vitest";
import type { CommercialLicenseContext } from "../contracts/commercial-lease.contract";
import { createCommercialLeaseCapability } from "../logic/commercial-lease";
import { createPostgresCommercialLeaseStore } from "../prisma/repositories/postgres-commercial-lease-store";
import { createPostgresCommercialSigningKeyProvider } from "../prisma/repositories/postgres-commercial-signing-key-provider";
import {
  createEd25519CommercialLeaseSigner,
  verifyCommercialLeaseEnvelope,
} from "../providers/ed25519-commercial-lease-signer";

const connectionString = process.env.DATABASE_URL?.trim();
const describePostgres = connectionString ? describe : describe.skip;
const pair = generateKeyPairSync("ed25519");
const privateKey = pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
const publicKey = pair.publicKey.export({ format: "pem", type: "spki" }).toString();
const licenseKey = "postgres-license-key-1234567890";
const keyHash = createHash("sha256").update(licenseKey).digest("hex");
const now = new Date("2026-09-05T00:00:00.000Z");

const context: CommercialLicenseContext = Object.freeze({
  licenseId: "postgres-license-1",
  licenseStatus: "ACTIVE",
  licenseExpiresAt: null,
  accountLifecycleState: "ACTIVE",
  subscriptionStatus: "ACTIVE",
  productId: "bke-postgres-product",
  productVersionEligible: true,
  versionAccepted: true,
  maxSeats: 1,
  maxDevicesPerSeat: 2,
});

describePostgres("commercial lease PostgreSQL runtime", () => {
  beforeEach(async () => {
    const client = new Client({ connectionString: connectionString! });
    await client.connect();
    try {
      await client.query(
        `TRUNCATE TABLE
          "CommercialLeaseOperation",
          "LicenseLeaseRecord",
          "DeviceActivation",
          "CommercialSigningKey",
          "LicenseEvent",
          "LicenseAssignment",
          "License"
         CASCADE`,
      );
      await client.query(
        `INSERT INTO "License"
          ("id", "publicId", "keyHash", "keyLastFour", "accountId", "orderId", "orderItemId", "productId",
           "status", "maxSeats", "maxDevicesPerSeat")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', 1, 2)`,
        [
          context.licenseId,
          "postgres-public-license-1",
          keyHash,
          "7890",
          "account-1",
          "order-1",
          "order-item-1",
          "product-record-1",
        ],
      );
    } finally {
      await client.end();
    }
  });

  it("persists signing key, activation, lease lifecycle, supersession, and idempotent replay", async () => {
    const store = createPostgresCommercialLeaseStore(connectionString!);
    const keys = createPostgresCommercialSigningKeyProvider(connectionString!, {
      keyId: "postgres-signing-key-1",
      publicKey,
      privateKeyReference: "env:TEST_POSTGRES_LEASE_PRIVATE_KEY",
    });
    const signer = createEd25519CommercialLeaseSigner({
      resolve(reference) {
        expect(reference).toBe("env:TEST_POSTGRES_LEASE_PRIVATE_KEY");
        return privateKey;
      },
    });
    const capability = createCommercialLeaseCapability({
      store,
      keys,
      signer,
      contexts: {
        async resolve(input) {
          return input.licenseKeyHash === keyHash && input.productVersion === "1.0.0"
            ? context
            : null;
        },
      },
      hasher: {
        hash(value) {
          return createHash("sha256").update(value).digest("hex");
        },
      },
      transfers: {
        async isTransferAllowed() {
          return false;
        },
      },
    });

    const firstRequest = Object.freeze({
      licenseKey,
      installationId: "postgres-installation-1",
      deviceId: "postgres-device-identity-0001",
      operationId: "postgres-operation-1",
      productVersion: "1.0.0",
      action: "ACTIVATION" as const,
      now,
    });
    const first = await capability.issue(firstRequest);
    const replay = await capability.issue(firstRequest);
    expect(replay).toEqual(first);
    expect(verifyCommercialLeaseEnvelope(first.lease, publicKey)).toBe(true);

    const firstPayload = JSON.parse(first.lease.payload) as {
      lease_id: string;
      generation: number;
      server_revision: number;
    };
    expect(firstPayload.generation).toBe(1);
    expect(firstPayload.server_revision).toBe(1);

    const second = await capability.issue({
      ...firstRequest,
      operationId: "postgres-operation-2",
    });
    const secondPayload = JSON.parse(second.lease.payload) as {
      lease_id: string;
      generation: number;
      server_revision: number;
    };
    expect(secondPayload.generation).toBe(2);
    expect(secondPayload.server_revision).toBe(2);

    const client = new Client({ connectionString: connectionString! });
    await client.connect();
    try {
      const counts = await client.query<{
        activations: string;
        leases: string;
        operations: string;
        keys: string;
      }>(`
        SELECT
          (SELECT COUNT(*)::text FROM "DeviceActivation") AS activations,
          (SELECT COUNT(*)::text FROM "LicenseLeaseRecord") AS leases,
          (SELECT COUNT(*)::text FROM "CommercialLeaseOperation") AS operations,
          (SELECT COUNT(*)::text FROM "CommercialSigningKey") AS keys
      `);
      expect(counts.rows[0]).toEqual({ activations: "1", leases: "2", operations: "2", keys: "1" });

      const leaseStates = await client.query<{ leaseId: string; status: string }>(
        `SELECT "leaseId", "status" FROM "LicenseLeaseRecord" ORDER BY "generation" ASC`,
      );
      expect(leaseStates.rows).toEqual([
        { leaseId: firstPayload.lease_id, status: "SUPERSEDED" },
        { leaseId: secondPayload.lease_id, status: "ACTIVE" },
      ]);

      const operationStates = await client.query<{ status: string }>(
        `SELECT "status" FROM "CommercialLeaseOperation" ORDER BY "operationId" ASC`,
      );
      expect(operationStates.rows).toEqual([{ status: "COMPLETED" }, { status: "COMPLETED" }]);
    } finally {
      await client.end();
    }
  });
});

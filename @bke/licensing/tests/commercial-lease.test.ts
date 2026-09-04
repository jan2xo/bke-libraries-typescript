import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  CommercialLeaseAction,
  CommercialLeaseRequest,
  CommercialLicenseContext,
} from "../contracts/commercial-lease.contract";
import {
  createCommercialLeaseCapability,
  type CommercialLeaseDependencies,
} from "../logic/commercial-lease";
import type {
  CommercialActivationRecord,
  CommercialLeaseRecord,
  CommercialLeaseTransaction,
  CommercialOperationMetadata,
  CommercialOperationRecord,
} from "../logic/commercial-lease-ports";
import type { CommercialSigningKeyRecord } from "../logic/commercial-signing-registry";
import { deviceIdentity } from "../logic/product-identity";

const now = new Date("2026-09-05T00:00:00.000Z");
const signingKey: CommercialSigningKeyRecord = Object.freeze({
  id: "signing-key-record",
  keyId: "lease-key-1",
  algorithm: "Ed25519",
  status: "ACTIVE",
  publicKey: "public-key",
  privateKeyReference: "env:LEASE_PRIVATE_KEY",
  createdAt: now,
  activatedAt: now,
  retiredAt: null,
  rotationReason: null,
  createdBy: null,
});

const baseContext: CommercialLicenseContext = Object.freeze({
  licenseId: "license-1",
  licenseStatus: "ACTIVE",
  licenseExpiresAt: null,
  accountLifecycleState: "ACTIVE",
  subscriptionStatus: "ACTIVE",
  productId: "bke-test-product",
  productVersionEligible: true,
  versionAccepted: true,
  maxSeats: 1,
  maxDevicesPerSeat: 2,
});

const baseRequest: CommercialLeaseRequest = Object.freeze({
  licenseKey: "license-key-1234567890",
  installationId: "installation-123",
  deviceId: "device-identity-0001",
  operationId: "operation-activation-1",
  productVersion: "1.2.3",
  action: "ACTIVATION",
  label: "Workstation",
  operatingSystem: "windows",
  architecture: "x64",
  now,
});

type FixtureOptions = Readonly<{
  context?: CommercialLicenseContext;
  transferAllowed?: boolean;
}>;

function fixture(options: FixtureOptions = {}) {
  const context = options.context ?? baseContext;
  const operations = new Map<string, CommercialOperationRecord>();
  const activations = new Map<string, CommercialActivationRecord>();
  const leases = new Map<string, CommercialLeaseRecord>();
  let sequence = 0;
  let signCount = 0;
  const id = () => `generated-${++sequence}`;

  const transaction: CommercialLeaseTransaction = {
    async findOperation(operationId) {
      return operations.get(operationId) ?? null;
    },
    async createOperation(input) {
      const record: CommercialOperationRecord = Object.freeze({
        id: input.id,
        operationId: input.operationId,
        licenseId: input.licenseId,
        action: input.action,
        status: "PENDING",
        resultLeaseId: null,
        metadata: Object.freeze({}),
      });
      operations.set(record.operationId, record);
      return record;
    },
    async completeOperation(input) {
      const current = operations.get(input.operationId);
      if (!current) throw new Error("OPERATION_NOT_FOUND");
      operations.set(
        input.operationId,
        Object.freeze({
          ...current,
          status: "COMPLETED",
          resultLeaseId: input.resultLeaseId,
        }),
      );
    },
    async findLease(leaseId) {
      return leases.get(leaseId) ?? null;
    },
    async findLatestLease(input) {
      return (
        [...leases.values()]
          .filter(
            (record) =>
              record.licenseId === input.licenseId &&
              record.installationId === input.installationId &&
              record.deviceId === input.deviceId,
          )
          .sort(
            (left, right) =>
              right.generation - left.generation || right.serverRevision - left.serverRevision,
          )[0] ?? null
      );
    },
    async findActivationByDeviceHash(licenseId, deviceHash) {
      const record = activations.get(deviceHash);
      return record?.licenseId === licenseId ? record : null;
    },
    async countActiveActivations(licenseId) {
      return [...activations.values()].filter(
        (record) => record.licenseId === licenseId && record.active,
      ).length;
    },
    async upsertActivation(input) {
      const existing = activations.get(input.deviceHash);
      const record: CommercialActivationRecord = Object.freeze({
        id: existing?.id ?? input.id,
        licenseId: input.licenseId,
        deviceHash: input.deviceHash,
        machineIdHint: existing?.machineIdHint ?? input.machineIdHint,
        label: input.label ?? existing?.label ?? null,
        operatingSystem: input.operatingSystem ?? existing?.operatingSystem ?? null,
        architecture: input.architecture ?? existing?.architecture ?? null,
        active: true,
      });
      activations.set(input.deviceHash, record);
      return record;
    },
    async touchActivation(input) {
      const entry = [...activations.entries()].find(([, record]) => record.id === input.id);
      if (!entry) throw new Error("DEVICE_ACTIVATION_NOT_FOUND");
      const [deviceHash, existing] = entry;
      const record: CommercialActivationRecord = Object.freeze({
        ...existing,
        label: input.label ?? existing.label,
        operatingSystem: input.operatingSystem ?? existing.operatingSystem,
        architecture: input.architecture ?? existing.architecture,
      });
      activations.set(deviceHash, record);
      return record;
    },
    async createLease(input) {
      const record: CommercialLeaseRecord = Object.freeze({
        id: input.id,
        licenseId: input.licenseId,
        leaseId: input.leaseId,
        generation: input.generation,
        serverRevision: input.serverRevision,
        installationId: input.installationId,
        deviceId: input.deviceId,
        version: input.version,
        status: "ACTIVE",
        action: input.action,
        operationId: input.operationId,
        signerKeyId: input.signerKeyId,
        expiresAt: input.expiresAt,
        leasePayload: input.leasePayload,
        leaseSignature: input.leaseSignature,
        supersededById: null,
        issuedAt: input.issuedAt,
      });
      leases.set(record.leaseId, record);
      return record;
    },
    async supersedeLease(input) {
      const entry = [...leases.entries()].find(
        ([, record]) => record.id === input.previousLeaseRecordId,
      );
      if (!entry) throw new Error("LEASE_NOT_FOUND");
      const [leaseId, previous] = entry;
      leases.set(
        leaseId,
        Object.freeze({
          ...previous,
          status: "SUPERSEDED",
          supersededById: input.supersededById,
        }),
      );
    },
  };

  const dependencies: CommercialLeaseDependencies = {
    store: {
      async withTransaction(work) {
        return work(transaction);
      },
    },
    contexts: {
      async resolve() {
        return context;
      },
    },
    keys: {
      async ensure() {},
      async active() {
        return signingKey;
      },
    },
    signer: {
      async issue(payload, key) {
        signCount += 1;
        return Object.freeze({
          payload: JSON.stringify(payload, Object.keys(payload).sort()),
          signature: `signature-${payload.lease_id}`,
          key_id: key.keyId,
          algorithm: "Ed25519" as const,
        });
      },
    },
    hasher: {
      hash(value) {
        return createHash("sha256").update(value).digest("hex");
      },
    },
    transfers: {
      async isTransferAllowed() {
        return options.transferAllowed ?? false;
      },
    },
    id,
  };

  function prepareOperation(
    action: CommercialLeaseAction,
    operationId: string,
    metadata: CommercialOperationMetadata = Object.freeze({}),
  ) {
    operations.set(
      operationId,
      Object.freeze({
        id: id(),
        operationId,
        licenseId: context.licenseId,
        action,
        status: "PENDING",
        resultLeaseId: null,
        metadata,
      }),
    );
  }

  return {
    capability: createCommercialLeaseCapability(dependencies),
    operations,
    activations,
    leases,
    prepareOperation,
    signCount: () => signCount,
  };
}

function payloadOf(result: Awaited<ReturnType<ReturnType<typeof createCommercialLeaseCapability>["issue"]>>) {
  return JSON.parse(result.lease.payload) as Record<string, unknown>;
}

describe("commercial lease capability", () => {
  it("issues an activation lease with the certified legacy payload", async () => {
    const state = fixture();
    const result = await state.capability.issue(baseRequest);
    const payload = payloadOf(result);

    expect(payload).toMatchObject({
      license_id: "license-1",
      generation: 1,
      server_revision: 1,
      product_id: "bke-test-product",
      installation_id: "installation-123",
      device_id: "device-identity-0001",
      version: "1.2.3",
      issuer: "BKE Digital Solutions",
      key_id: "lease-key-1",
      algorithm: "Ed25519",
      revoked: false,
      superseded_by: null,
    });
    expect(state.operations.get(baseRequest.operationId)?.status).toBe("COMPLETED");
    expect(state.activations.size).toBe(1);
    expect(state.leases.size).toBe(1);
    expect(state.signCount()).toBe(1);
  });

  it("replays a completed operation from the persisted envelope", async () => {
    const state = fixture();
    const first = await state.capability.issue(baseRequest);
    const replay = await state.capability.issue(baseRequest);

    expect(replay).toEqual(first);
    expect(state.leases.size).toBe(1);
    expect(state.signCount()).toBe(1);
  });

  it("increments generation/revision and supersedes the predecessor", async () => {
    const state = fixture();
    const first = await state.capability.issue(baseRequest);
    const firstPayload = payloadOf(first);
    const secondRequest = {
      ...baseRequest,
      operationId: "operation-replacement-2",
      action: "REPLACEMENT" as const,
      predecessorLeaseId: String(firstPayload.lease_id),
    };
    state.prepareOperation("REPLACEMENT", secondRequest.operationId, {
      predecessorLeaseId: secondRequest.predecessorLeaseId,
    });

    const second = await state.capability.issue(secondRequest);
    const secondPayload = payloadOf(second);
    expect(secondPayload.generation).toBe(2);
    expect(secondPayload.server_revision).toBe(2);
    const firstRecord = state.leases.get(String(firstPayload.lease_id));
    const secondRecord = state.leases.get(String(secondPayload.lease_id));
    expect(firstRecord?.status).toBe("SUPERSEDED");
    expect(firstRecord?.supersededById).toBe(secondRecord?.id);
  });

  it("requires a prepared operation for non-activation actions", async () => {
    const state = fixture();
    await expect(
      state.capability.issue({ ...baseRequest, action: "REFRESH", operationId: "missing-refresh" }),
    ).rejects.toThrow("COMMERCIAL_OPERATION_REQUIRED");
  });

  it("rejects a pending operation when the requested action changes", async () => {
    const state = fixture();
    state.prepareOperation("REFRESH", "refresh-1");
    await expect(
      state.capability.issue({ ...baseRequest, action: "ACTIVATION", operationId: "refresh-1" }),
    ).rejects.toThrow("OPERATION_ACTION_MISMATCH");
  });

  it("blocks renewal when the subscription is not active", async () => {
    const state = fixture({ context: { ...baseContext, subscriptionStatus: "CANCELLED" } });
    state.prepareOperation("RENEWAL", "renewal-1");
    await expect(
      state.capability.issue({ ...baseRequest, action: "RENEWAL", operationId: "renewal-1" }),
    ).rejects.toThrow("RENEWAL_NOT_ELIGIBLE");
  });

  it("requires an approved transfer policy", async () => {
    const denied = fixture({ transferAllowed: false });
    denied.prepareOperation("TRANSFER", "transfer-1", { policyId: "policy-1" });
    await expect(
      denied.capability.issue({ ...baseRequest, action: "TRANSFER", operationId: "transfer-1" }),
    ).rejects.toThrow("TRANSFER_NOT_ALLOWED");

    const allowed = fixture({ transferAllowed: true });
    allowed.prepareOperation("TRANSFER", "transfer-2", { policyId: "policy-1" });
    await expect(
      allowed.capability.issue({ ...baseRequest, action: "TRANSFER", operationId: "transfer-2" }),
    ).resolves.toMatchObject({ lease: { algorithm: "Ed25519" } });
  });

  it("enforces maxSeats multiplied by maxDevicesPerSeat", async () => {
    const state = fixture({ context: { ...baseContext, maxSeats: 1, maxDevicesPerSeat: 1 } });
    const other = deviceIdentity("other-device-identity-0001");
    state.activations.set(
      other.deviceHash,
      Object.freeze({
        id: "existing-device",
        licenseId: "license-1",
        deviceHash: other.deviceHash,
        machineIdHint: other.machineIdHint,
        label: null,
        operatingSystem: null,
        architecture: null,
        active: true,
      }),
    );

    await expect(state.capability.issue(baseRequest)).rejects.toThrow("ACTIVATION_LIMIT");
  });

  it.each([
    [{ ...baseContext, licenseStatus: "REVOKED" }, "INVALID_LICENSE"],
    [{ ...baseContext, accountLifecycleState: "CLOSED" }, "INVALID_LICENSE"],
    [{ ...baseContext, productVersionEligible: false }, "VERSION_NOT_ELIGIBLE"],
    [{ ...baseContext, versionAccepted: false }, "VERSION_NOT_ACCEPTED"],
    [{ ...baseContext, productId: null }, "PRODUCT_ID_NOT_CONFIGURED"],
  ] as const)("fails closed for invalid external licensing context", async (context, code) => {
    const state = fixture({ context });
    await expect(state.capability.issue(baseRequest)).rejects.toThrow(code);
  });
});

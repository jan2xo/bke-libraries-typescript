import { describe, expect, it } from "vitest";
import type {
  CommercialLicenseContext,
  CommercialLeaseRequest,
} from "../contracts/commercial-lease.contract";
import { createCommercialLeaseCapability } from "../logic/commercial-lease";
import type {
  CommercialActivationRecord,
  CommercialLeaseRecord,
  CommercialLeaseStore,
  CommercialOperationMetadata,
  CommercialOperationRecord,
} from "../logic/commercial-lease-ports";
import type { CommercialSigningKeyRecord } from "../logic/commercial-signing-registry";

const NOW = new Date("2026-09-05T00:00:00.000Z");
const SIGNING_KEY: CommercialSigningKeyRecord = {
  keyId: "signing-key-1",
  privateKeyReference: "secret://signing-key-1",
  algorithm: "Ed25519",
  status: "ACTIVE",
  activeFrom: new Date("2026-09-01T00:00:00.000Z"),
  activeTo: null,
  revokedAt: null,
};

const baseContext: CommercialLicenseContext = {
  licenseId: "license-1",
  accountId: "account-1",
  licenseActive: true,
  accountActive: true,
  subscriptionActive: true,
  versionAccepted: true,
  minSupportedVersion: "1.0.0",
  policy: {
    maxDevices: 2,
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

const request = (overrides: Partial<CommercialLeaseRequest> = {}): CommercialLeaseRequest => ({
  licenseKey: "license-key-1234567890",
  clientVersion: "1.0.0",
  fingerprint: "fingerprint-123",
  installationId: "installation-123",
  idempotencyKey: "operation-123",
  now: NOW,
  ...overrides,
});

function createHarness(context: CommercialLicenseContext = baseContext) {
  const activations: CommercialActivationRecord[] = [];
  const leases: CommercialLeaseRecord[] = [];
  const operations = new Map<string, CommercialOperationRecord>();
  let idCounter = 0;
  let currentContext = context;

  const store: CommercialLeaseStore = {
    async withTransaction(work) {
      return work({
        async findOperation(operationId) {
          return operations.get(operationId) ?? null;
        },
        async createOperation(input) {
          const record: CommercialOperationRecord = {
            id: input.id,
            operationId: input.operationId,
            licenseId: input.licenseId,
            action: input.action,
            status: "PENDING",
            resultLeaseId: null,
            metadata: input.metadata,
          };
          operations.set(input.operationId, record);
          return record;
        },
        async completeOperation(input) {
          const current = operations.get(input.operationId);
          if (!current) throw new Error("TEST_OPERATION_MISSING");
          operations.set(input.operationId, {
            ...current,
            status: "COMPLETED",
            resultLeaseId: input.resultLeaseId,
            metadata: input.metadata,
          });
        },
        async findLease(leaseId) {
          return leases.find((lease) => lease.leaseId === leaseId) ?? null;
        },
        async findActivationByInstallation(licenseId, installationId) {
          return activations.find((activation) =>
            activation.licenseId === licenseId &&
            activation.installationId === installationId &&
            activation.active
          ) ?? null;
        },
        async findActivationByFingerprint(licenseId, fingerprint) {
          return activations.find((activation) =>
            activation.licenseId === licenseId &&
            activation.deviceHash === fingerprint &&
            activation.active
          ) ?? null;
        },
        async countActiveActivations(licenseId) {
          return activations.filter((activation) => activation.licenseId === licenseId && activation.active).length;
        },
        async createActivation(input) {
          const record: CommercialActivationRecord = {
            id: input.id,
            licenseId: input.licenseId,
            deviceHash: input.fingerprint,
            installationId: input.installationId,
            clientVersion: input.clientVersion,
            active: true,
          };
          activations.push(record);
          return record;
        },
        async updateActivation(input) {
          const index = activations.findIndex((activation) => activation.id === input.id);
          if (index < 0) throw new Error("TEST_ACTIVATION_MISSING");
          const current = activations[index]!;
          const updated: CommercialActivationRecord = {
            ...current,
            deviceHash: input.fingerprint,
            installationId: input.installationId,
            clientVersion: input.clientVersion,
          };
          activations[index] = updated;
          return updated;
        },
        async findLatestActiveLease(licenseId, deviceId) {
          return leases
            .filter((lease) => lease.licenseId === licenseId && lease.deviceId === deviceId && lease.status === "ACTIVE")
            .sort((left, right) => right.generation - left.generation || right.serverRevision - left.serverRevision)[0] ?? null;
        },
        async markActiveLeasesReplaced(input) {
          for (let index = 0; index < leases.length; index += 1) {
            const lease = leases[index]!;
            if (lease.licenseId === input.licenseId && lease.deviceId === input.deviceId && lease.status === "ACTIVE" && lease.id !== input.supersededById) {
              leases[index] = { ...lease, status: "REPLACED" };
            }
          }
        },
        async createLease(input) {
          const record: CommercialLeaseRecord = {
            ...input,
            status: "ACTIVE",
          };
          leases.push(record);
          return record;
        },
      });
    },
  };

  const capability = createCommercialLeaseCapability({
    store,
    contexts: {
      async resolve() {
        return currentContext;
      },
    },
    keys: {
      async active() {
        return SIGNING_KEY;
      },
      async resolve(keyId) {
        if (keyId !== SIGNING_KEY.keyId) throw new Error("COMMERCIAL_SIGNING_KEY_UNAVAILABLE");
        return SIGNING_KEY;
      },
    },
    signer: {
      async sign(claims, key) {
        return `token:${claims.jti}:${key.keyId}`;
      },
    },
    hasher: {
      hash(value) {
        return `hash:${value}`;
      },
    },
    devices: {
      classify() {
        return { isVirtualMachine: false, isContainer: false };
      },
    },
    allowTransfer: true,
    id() {
      idCounter += 1;
      return `generated-${idCounter}`;
    },
  });

  return {
    capability,
    activations,
    leases,
    operations,
    setContext(next: CommercialLicenseContext) {
      currentContext = next;
    },
  };
}

describe("commercial lease capability", () => {
  it("issues an initial identity-bound lease", async () => {
    const harness = createHarness();
    const result = await harness.capability.issue(request());

    expect(result.operation).toMatchObject({
      action: "ISSUE",
      decision: "ISSUED",
      reasonCode: "INITIAL_ISSUE",
    });
    expect(result.lease.refreshAfter.toISOString()).toBe("2026-09-05T00:01:00.000Z");
    expect(result.lease.expiresAt.toISOString()).toBe("2026-09-05T00:05:00.000Z");
    expect(harness.activations).toHaveLength(1);
    expect(harness.leases).toHaveLength(1);
    expect(result.token).toBe(`token:${result.lease.tokenId}:signing-key-1`);
  });

  it("keeps an unchanged active lease for a new equivalent operation", async () => {
    const harness = createHarness();
    const first = await harness.capability.issue(request());
    const second = await harness.capability.issue(request({ idempotencyKey: "operation-456" }));

    expect(second.operation).toMatchObject({ decision: "UNCHANGED", reasonCode: "UNCHANGED" });
    expect(second.lease.tokenId).toBe(first.lease.tokenId);
    expect(harness.leases).toHaveLength(1);
  });

  it("replays the exact completed idempotent operation without creating another lease", async () => {
    const harness = createHarness();
    const first = await harness.capability.issue(request());
    const replay = await harness.capability.issue(request());

    expect(replay.lease.tokenId).toBe(first.lease.tokenId);
    expect(replay.operation.decision).toBe("ISSUED");
    expect(harness.leases).toHaveLength(1);
  });

  it("rejects reuse of an idempotency key for different request semantics", async () => {
    const harness = createHarness();
    await harness.capability.issue(request());

    await expect(harness.capability.issue(request({ fingerprint: "fingerprint-999" })))
      .rejects.toThrow("IDEMPOTENCY_KEY_REUSED");
  });

  it("requires an existing activation for refresh", async () => {
    const harness = createHarness();
    await expect(harness.capability.issue(request({ requestedAction: "REFRESH" })))
      .rejects.toThrow("ACTIVATION_REQUIRED");
  });

  it("enforces the effective device limit", async () => {
    const harness = createHarness({
      ...baseContext,
      policy: { ...baseContext.policy, maxDevices: 1 },
    });
    await harness.capability.issue(request());

    await expect(harness.capability.issue(request({
      fingerprint: "fingerprint-999",
      installationId: "installation-999",
      idempotencyKey: "operation-999",
    }))).rejects.toThrow("DEVICE_LIMIT_REACHED");
  });

  it("fails closed on account, subscription, license, and version state", async () => {
    const cases: Array<[Partial<CommercialLicenseContext>, string]> = [
      [{ licenseActive: false }, "LICENSE_INACTIVE"],
      [{ accountActive: false }, "ACCOUNT_INACTIVE"],
      [{ subscriptionActive: false }, "SUBSCRIPTION_INACTIVE"],
      [{ versionAccepted: false }, "CLIENT_VERSION_MISMATCH"],
    ];

    for (const [override, expected] of cases) {
      const harness = createHarness({ ...baseContext, ...override });
      await expect(harness.capability.issue(request())).rejects.toThrow(expected);
    }
  });
});

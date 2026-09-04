import { randomUUID } from "node:crypto";
import type {
  CommercialLeaseClaims,
  CommercialLeaseRequest,
  CommercialLeaseResult,
  CommercialLicenseContext,
} from "../contracts/commercial-lease.contract";
import { calculateLeaseTimes, isLeaseExpired, validateClientCompatibility } from "./lease-lifecycle";
import { refreshRequiresReplacement } from "./refresh-decision";
import type {
  CommercialActivationRecord,
  CommercialLeaseRecord,
  CommercialLeaseStore,
  CommercialLicenseContextProvider,
  CommercialLicenseKeyHasher,
  CommercialSigningKeyProvider,
  CommercialLeaseSigner,
  CommercialDeviceClassifier,
  CommercialOperationMetadata,
} from "./commercial-lease-ports";
import type { CommercialSigningKeyRecord } from "./commercial-signing-registry";

export type CommercialLeaseDependencies = Readonly<{
  store: CommercialLeaseStore;
  contexts: CommercialLicenseContextProvider;
  keys: CommercialSigningKeyProvider;
  signer: CommercialLeaseSigner;
  hasher: CommercialLicenseKeyHasher;
  devices: CommercialDeviceClassifier;
  allowTransfer: boolean;
  id?: () => string;
}>;

function validateRequest(input: CommercialLeaseRequest) {
  const licenseKey = input.licenseKey.trim();
  const clientVersion = input.clientVersion.trim();
  const fingerprint = input.fingerprint.trim();
  const installationId = input.installationId.trim();
  const idempotencyKey = input.idempotencyKey.trim();
  if (licenseKey.length < 16) throw new Error("LICENSE_NOT_FOUND");
  if (fingerprint.length < 8) throw new Error("INVALID_DEVICE_FINGERPRINT");
  if (installationId.length < 8) throw new Error("INVALID_INSTALLATION_ID");
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) throw new Error("INVALID_IDEMPOTENCY_KEY");
  return Object.freeze({
    licenseKey,
    clientVersion,
    fingerprint,
    installationId,
    idempotencyKey,
    requestedAction: input.requestedAction ?? "ISSUE" as const,
    now: input.now ? new Date(input.now) : new Date(),
  });
}

function validateContext(context: CommercialLicenseContext, clientVersion: string) {
  if (!context.licenseActive) throw new Error("LICENSE_INACTIVE");
  if (!context.accountActive) throw new Error("ACCOUNT_INACTIVE");
  if (!context.subscriptionActive) throw new Error("SUBSCRIPTION_INACTIVE");
  if (!Number.isInteger(context.policy.maxDevices) || context.policy.maxDevices < 1) {
    throw new Error("INVALID_LICENSE_POLICY");
  }
  validateClientCompatibility(clientVersion, context.minSupportedVersion);
  if (!context.versionAccepted) throw new Error("CLIENT_VERSION_MISMATCH");
  calculateLeaseTimes(new Date(0), context.policy.refreshAfterSeconds, context.policy.hardExpirySeconds);
}

function operationMetadataMatches(
  metadata: CommercialOperationMetadata,
  request: ReturnType<typeof validateRequest>,
): boolean {
  return (
    metadata.fingerprint === request.fingerprint &&
    metadata.clientVersion === request.clientVersion &&
    metadata.requestedAction === request.requestedAction
  );
}

function policyChanged(lease: CommercialLeaseRecord, context: CommercialLicenseContext): boolean {
  if (!lease.refreshAfter || !lease.expiresAt) return true;
  const expected = calculateLeaseTimes(
    lease.issuedAt,
    context.policy.refreshAfterSeconds,
    context.policy.hardExpirySeconds,
  );
  return (
    expected.refreshAfter.getTime() !== lease.refreshAfter.getTime() ||
    expected.expiresAt.getTime() !== lease.expiresAt.getTime()
  );
}

function claimsFor(
  context: CommercialLicenseContext,
  lease: CommercialLeaseRecord,
  key: CommercialSigningKeyRecord,
): CommercialLeaseClaims {
  if (!lease.refreshAfter || !lease.expiresAt) throw new Error("LEASE_RECORD_INCOMPLETE");
  const issuedAt = Math.floor(lease.issuedAt.getTime() / 1000);
  return Object.freeze({
    sub: context.accountId,
    licenseId: context.licenseId,
    deviceId: lease.deviceId,
    productId: context.identity.packageFamily,
    productVersionId: context.identity.releaseIdentityKey,
    packageFamily: context.identity.packageFamily,
    packageIdentityKey: context.identity.packageIdentityKey,
    releaseIdentityKey: context.identity.releaseIdentityKey,
    clientVersion: lease.version,
    contractVersion: context.identity.contractVersion,
    entitlements: context.identity.entitlements,
    signingKeyId: key.keyId,
    leaseKeyId: key.keyId,
    leaseKeyIssuedAt: Math.floor(key.activeFrom.getTime() / 1000),
    iat: issuedAt,
    nbf: issuedAt,
    refreshAfter: Math.floor(lease.refreshAfter.getTime() / 1000),
    exp: Math.floor(lease.expiresAt.getTime() / 1000),
    jti: lease.leaseId,
  });
}

async function bindActivation(
  transaction: Parameters<Parameters<CommercialLeaseStore["withTransaction"]>[0]>[0],
  context: CommercialLicenseContext,
  request: ReturnType<typeof validateRequest>,
  dependencies: CommercialLeaseDependencies,
): Promise<CommercialActivationRecord> {
  const classification = dependencies.devices.classify(request.fingerprint);
  let activation = await transaction.findActivationByInstallation(context.licenseId, request.installationId);

  if (!activation && request.requestedAction === "REFRESH") throw new Error("ACTIVATION_REQUIRED");

  if (!activation) {
    const byFingerprint = await transaction.findActivationByFingerprint(context.licenseId, request.fingerprint);
    if (byFingerprint) {
      if (
        byFingerprint.installationId &&
        byFingerprint.installationId !== request.installationId &&
        !(context.policy.transferable && dependencies.allowTransfer)
      ) {
        throw new Error("INSTALLATION_NOT_BOUND");
      }
      activation = await transaction.updateActivation({
        id: byFingerprint.id,
        fingerprint: request.fingerprint,
        installationId: request.installationId,
        clientVersion: request.clientVersion,
        ...classification,
        now: request.now,
      });
    } else {
      const activeCount = await transaction.countActiveActivations(context.licenseId);
      if (activeCount >= context.policy.maxDevices) throw new Error("DEVICE_LIMIT_REACHED");
      activation = await transaction.createActivation({
        id: (dependencies.id ?? randomUUID)(),
        licenseId: context.licenseId,
        fingerprint: request.fingerprint,
        installationId: request.installationId,
        clientVersion: request.clientVersion,
        ...classification,
        now: request.now,
      });
    }
  } else {
    if (
      activation.deviceHash !== request.fingerprint &&
      !(context.policy.transferable && dependencies.allowTransfer)
    ) {
      throw new Error("DEVICE_BINDING_MISMATCH");
    }
    activation = await transaction.updateActivation({
      id: activation.id,
      fingerprint: request.fingerprint,
      installationId: request.installationId,
      clientVersion: request.clientVersion,
      ...classification,
      now: request.now,
    });
  }

  return activation;
}

export function createCommercialLeaseCapability(dependencies: CommercialLeaseDependencies) {
  const issue = async (input: CommercialLeaseRequest): Promise<CommercialLeaseResult> => {
    const request = validateRequest(input);
    const licenseKeyHash = dependencies.hasher.hash(request.licenseKey);
    const context = await dependencies.contexts.resolve({
      licenseKeyHash,
      clientVersion: request.clientVersion,
    });
    if (!context) throw new Error("LICENSE_NOT_FOUND");
    validateContext(context, request.clientVersion);

    return dependencies.store.withTransaction(async (transaction) => {
      const existingOperation = await transaction.findOperation(request.idempotencyKey);
      if (existingOperation) {
        if (
          existingOperation.licenseId !== context.licenseId ||
          !operationMetadataMatches(existingOperation.metadata, request)
        ) {
          throw new Error("IDEMPOTENCY_KEY_REUSED");
        }
        if (!existingOperation.resultLeaseId) throw new Error("IDEMPOTENCY_RESULT_EXPIRED");
        const priorLease = await transaction.findLease(existingOperation.resultLeaseId);
        if (
          !priorLease ||
          priorLease.status !== "ACTIVE" ||
          !priorLease.expiresAt ||
          isLeaseExpired(priorLease.expiresAt, request.now) ||
          !priorLease.signerKeyId
        ) {
          throw new Error("IDEMPOTENCY_RESULT_EXPIRED");
        }
        const key = await dependencies.keys.resolve(priorLease.signerKeyId, request.now);
        const token = await dependencies.signer.sign(claimsFor(context, priorLease, key), key);
        return Object.freeze({
          token,
          lease: Object.freeze({
            tokenId: priorLease.leaseId,
            issuedAt: priorLease.issuedAt,
            refreshAfter: priorLease.refreshAfter!,
            expiresAt: priorLease.expiresAt,
            signingKeyId: key.keyId,
          }),
          operation: Object.freeze({
            id: existingOperation.id,
            action: request.requestedAction,
            decision: existingOperation.metadata.decision ?? (request.requestedAction === "ISSUE" ? "ISSUED" : "REFRESHED"),
            reasonCode: existingOperation.metadata.reasonCode ?? "IDEMPOTENT_REPLAY",
          }),
        });
      }

      const operationId = (dependencies.id ?? randomUUID)();
      await transaction.createOperation({
        id: operationId,
        operationId: request.idempotencyKey,
        licenseId: context.licenseId,
        action: request.requestedAction,
        metadata: {
          fingerprint: request.fingerprint,
          clientVersion: request.clientVersion,
          requestedAction: request.requestedAction,
        },
        createdAt: request.now,
      });

      const activation = await bindActivation(transaction, context, request, dependencies);
      const existingLease = await transaction.findLatestActiveLease(context.licenseId, activation.id);
      const hasExistingActiveLease = Boolean(
        existingLease?.status === "ACTIVE" &&
        existingLease.expiresAt &&
        !isLeaseExpired(existingLease.expiresAt, request.now),
      );
      const refreshDecision = refreshRequiresReplacement({
        requestFingerprint: request.fingerprint,
        existingFingerprint: activation.deviceHash,
        requestedVersion: request.clientVersion,
        existingVersion: existingLease?.version ?? null,
        hasExistingActiveLease,
        policyChanged: existingLease ? policyChanged(existingLease, context) : false,
        versionAccepted: context.versionAccepted,
      });

      if (!refreshDecision.replacement && existingLease) {
        if (!existingLease.signerKeyId || !existingLease.refreshAfter || !existingLease.expiresAt) {
          throw new Error("LEASE_RECORD_INCOMPLETE");
        }
        const key = await dependencies.keys.resolve(existingLease.signerKeyId, request.now);
        const token = await dependencies.signer.sign(claimsFor(context, existingLease, key), key);
        const metadata = {
          fingerprint: request.fingerprint,
          clientVersion: request.clientVersion,
          requestedAction: request.requestedAction,
          decision: "UNCHANGED" as const,
          reasonCode: refreshDecision.reason,
        };
        await transaction.completeOperation({
          operationId: request.idempotencyKey,
          resultLeaseId: existingLease.leaseId,
          metadata,
          completedAt: request.now,
        });
        return Object.freeze({
          token,
          lease: Object.freeze({
            tokenId: existingLease.leaseId,
            issuedAt: existingLease.issuedAt,
            refreshAfter: existingLease.refreshAfter,
            expiresAt: existingLease.expiresAt,
            signingKeyId: key.keyId,
          }),
          operation: Object.freeze({
            id: operationId,
            action: request.requestedAction,
            decision: "UNCHANGED" as const,
            reasonCode: refreshDecision.reason,
          }),
        });
      }

      const key = await dependencies.keys.active(request.now);
      const times = calculateLeaseTimes(
        request.now,
        context.policy.refreshAfterSeconds,
        context.policy.hardExpirySeconds,
      );
      const leaseRecordId = (dependencies.id ?? randomUUID)();
      const leaseId = (dependencies.id ?? randomUUID)();
      const createdLease = await transaction.createLease({
        id: leaseRecordId,
        licenseId: context.licenseId,
        leaseId,
        generation: (existingLease?.generation ?? 0) + 1,
        serverRevision: (existingLease?.serverRevision ?? 0) + 1,
        installationId: request.installationId,
        deviceId: activation.id,
        version: request.clientVersion,
        action: request.requestedAction,
        operationId: request.idempotencyKey,
        signerKeyId: key.keyId,
        refreshAfter: times.refreshAfter,
        expiresAt: times.expiresAt,
        issuedAt: times.issuedAt,
      });
      if (existingLease) {
        await transaction.markActiveLeasesReplaced({
          licenseId: context.licenseId,
          deviceId: activation.id,
          supersededById: leaseRecordId,
          replacedAt: request.now,
        });
      }

      const token = await dependencies.signer.sign(claimsFor(context, createdLease, key), key);
      const decision = request.requestedAction === "ISSUE" ? "ISSUED" as const : "REFRESHED" as const;
      const metadata = {
        fingerprint: request.fingerprint,
        clientVersion: request.clientVersion,
        requestedAction: request.requestedAction,
        decision,
        reasonCode: refreshDecision.reason,
      };
      await transaction.completeOperation({
        operationId: request.idempotencyKey,
        resultLeaseId: createdLease.leaseId,
        metadata,
        completedAt: request.now,
      });

      return Object.freeze({
        token,
        lease: Object.freeze({
          tokenId: createdLease.leaseId,
          issuedAt: createdLease.issuedAt,
          refreshAfter: createdLease.refreshAfter!,
          expiresAt: createdLease.expiresAt!,
          signingKeyId: key.keyId,
        }),
        operation: Object.freeze({
          id: operationId,
          action: request.requestedAction,
          decision,
          reasonCode: refreshDecision.reason,
        }),
      });
    });
  };

  return Object.freeze({ issue });
}

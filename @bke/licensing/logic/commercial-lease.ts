import { randomUUID } from "node:crypto";
import {
  commercialLeaseActions,
  type CommercialLeaseAction,
  type CommercialLeaseEnvelope,
  type CommercialLeasePayload,
  type CommercialLeaseRequest,
  type CommercialLeaseResult,
  type CommercialLicenseContext,
} from "../contracts/commercial-lease.contract";
import { transferPolicyIdFromOperationMetadata } from "../contracts/transfer-policy.contract";
import { isVersionAccepted } from "./accepted-version-policy";
import { nextLeaseLifecycle, requireProductVersion } from "./lease-lifecycle";
import { deviceIdentity } from "./product-identity";
import type {
  CommercialLeaseRecord,
  CommercialLeaseSigner,
  CommercialLeaseStore,
  CommercialLicenseContextProvider,
  CommercialLicenseKeyHasher,
  CommercialSigningKeyProvider,
  CommercialTransferEligibilityProvider,
} from "./commercial-lease-ports";

const THIRTY_DAYS_MS = 30 * 86_400_000;

export type CommercialLeaseDependencies = Readonly<{
  store: CommercialLeaseStore;
  contexts: CommercialLicenseContextProvider;
  keys: CommercialSigningKeyProvider;
  signer: CommercialLeaseSigner;
  hasher: CommercialLicenseKeyHasher;
  transfers: CommercialTransferEligibilityProvider;
  issuer?: string;
  id?: () => string;
}>;

function isCommercialLeaseAction(value: string): value is CommercialLeaseAction {
  return (commercialLeaseActions as readonly string[]).includes(value);
}

function actionFrom(value: string): CommercialLeaseAction {
  if (!isCommercialLeaseAction(value)) throw new Error("COMMERCIAL_OPERATION_ACTION_UNSUPPORTED");
  return value;
}

function validateLicenseContext(
  context: CommercialLicenseContext | null,
  now: Date,
): CommercialLicenseContext {
  if (
    !context ||
    context.accountLifecycleState !== "ACTIVE" ||
    context.licenseStatus !== "ACTIVE" ||
    !Number.isSafeInteger(context.maxSeats) ||
    context.maxSeats < 1 ||
    !Number.isSafeInteger(context.maxDevicesPerSeat) ||
    context.maxDevicesPerSeat < 1 ||
    (context.licenseExpiresAt !== null &&
      (!(context.licenseExpiresAt instanceof Date) ||
        !Number.isFinite(context.licenseExpiresAt.getTime()) ||
        context.licenseExpiresAt.getTime() <= now.getTime()))
  ) {
    throw new Error("INVALID_LICENSE");
  }
  return context;
}

function requireBoundedText(value: unknown, min: number, max: number): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < min ||
    value.length > max ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error("INVALID_COMMERCIAL_LEASE_REQUEST");
  }
  return value;
}

function metadataValue(metadata: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = metadata[key];
  return value === undefined || value === null ? undefined : String(value);
}

function replayEnvelope(record: CommercialLeaseRecord): CommercialLeaseEnvelope {
  if (!record.leasePayload || !record.leaseSignature || !record.signerKeyId) {
    throw new Error("LEASE_RECORD_INCOMPLETE");
  }
  return Object.freeze({
    payload: record.leasePayload,
    signature: record.leaseSignature,
    key_id: record.signerKeyId,
    algorithm: "Ed25519" as const,
  });
}

function retryableTransactionError(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = String((error as { code?: unknown }).code ?? "");
    if (code === "40001" || code === "40P01") return true;
  }
  return error instanceof Error && /P20(00|01|02)/.test(error.message);
}

export function createCommercialLeaseCapability(dependencies: CommercialLeaseDependencies) {
  const issue = async (input: CommercialLeaseRequest): Promise<CommercialLeaseResult> => {
    await dependencies.keys.ensure();
    const signingKey = await dependencies.keys.active();
    const id = dependencies.id ?? randomUUID;
    const issuer = dependencies.issuer ?? "BKE Digital Solutions";

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const now = input.now ? new Date(input.now) : new Date();
      if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
        throw new Error("INVALID_COMMERCIAL_LEASE_REQUEST");
      }
      const licenseKey = requireBoundedText(input.licenseKey, 1, 512);
      const installationId = requireBoundedText(input.installationId, 1, 256);
      const operationId = requireBoundedText(input.operationId, 8, 128);
      try {
        const context = validateLicenseContext(
          await dependencies.contexts.resolve({
            licenseKeyHash: dependencies.hasher.hash(licenseKey),
            productVersion: input.productVersion,
          }),
          now,
        );

        return await dependencies.store.withTransaction(async (transaction) => {
          let operation = await transaction.findOperation(operationId);
          if (!operation) {
            if (input.action !== "ACTIVATION") throw new Error("COMMERCIAL_OPERATION_REQUIRED");
            operation = await transaction.createOperation({
              id: id(),
              operationId,
              licenseId: context.licenseId,
              action: "ACTIVATION",
              createdAt: now,
            });
          } else {
            if (operation.licenseId !== context.licenseId) {
              throw new Error("OPERATION_LICENSE_MISMATCH");
            }
            if (input.action && input.action !== operation.action) {
              throw new Error("OPERATION_ACTION_MISMATCH");
            }

            if (operation.status === "COMPLETED" && operation.resultLeaseId) {
              const normalizedDevice = deviceIdentity(input.deviceId).deviceId;
              const normalizedVersion = requireProductVersion(input.productVersion);
              if (
                (metadataValue(operation.metadata, "installationId") !== undefined &&
                  metadataValue(operation.metadata, "installationId") !== installationId) ||
                (metadataValue(operation.metadata, "deviceId") !== undefined &&
                  metadataValue(operation.metadata, "deviceId") !== normalizedDevice) ||
                (input.predecessorLeaseId &&
                  metadataValue(operation.metadata, "predecessorLeaseId") !== input.predecessorLeaseId)
              ) {
                throw new Error("OPERATION_INPUT_MISMATCH");
              }
              const prior = await transaction.findLease(operation.resultLeaseId);
              if (!prior) throw new Error("COMMERCIAL_LEASE_NOT_FOUND");
              if (
                prior.licenseId !== context.licenseId ||
                prior.installationId !== installationId ||
                prior.deviceId !== normalizedDevice ||
                prior.version !== normalizedVersion
              ) {
                throw new Error("OPERATION_INPUT_MISMATCH");
              }
              return Object.freeze({ lease: replayEnvelope(prior) });
            }
          }

          const action = actionFrom(operation.action);
          if (action === "RENEWAL" && context.subscriptionStatus !== "ACTIVE") {
            throw new Error("RENEWAL_NOT_ELIGIBLE");
          }

          if (action === "TRANSFER") {
            const policyId = transferPolicyIdFromOperationMetadata(operation.metadata);
            if (!policyId) throw new Error("TRANSFER_NOT_ALLOWED");
            if (
              !(await dependencies.transfers.isTransferAllowed({
                licenseId: context.licenseId,
                orderItemId: context.orderItemId,
                policyId,
              }))
            ) {
              throw new Error("TRANSFER_NOT_ALLOWED");
            }
          }

          const version = requireProductVersion(input.productVersion);
          if (!context.productVersionEligible) throw new Error("VERSION_NOT_ELIGIBLE");
          if (
            !isVersionAccepted(
              version,
              context.minimumAcceptedVersion,
              context.maximumAcceptedVersion,
            )
          ) {
            throw new Error("VERSION_NOT_ACCEPTED");
          }
          if (!context.productId) throw new Error("PRODUCT_ID_NOT_CONFIGURED");

          const identity = deviceIdentity(input.deviceId);
          const existingDevice = await transaction.findActivationByDeviceHash(
            context.licenseId,
            identity.deviceHash,
          );

          if (!existingDevice?.active) {
            const active = await transaction.countActiveActivations(context.licenseId);
            if (active >= context.maxSeats * context.maxDevicesPerSeat) {
              throw new Error("ACTIVATION_LIMIT");
            }
            await transaction.upsertActivation({
              id: id(),
              licenseId: context.licenseId,
              deviceHash: identity.deviceHash,
              machineIdHint: identity.machineIdHint,
              label: input.label,
              operatingSystem: input.operatingSystem,
              architecture: input.architecture,
              now,
            });
          } else {
            await transaction.touchActivation({
              id: existingDevice.id,
              label: input.label,
              operatingSystem: input.operatingSystem,
              architecture: input.architecture,
              now,
            });
          }

          const predecessor = input.predecessorLeaseId
            ? await transaction.findLease(input.predecessorLeaseId)
            : await transaction.findLatestLease({
                licenseId: context.licenseId,
                installationId,
                deviceId: identity.deviceId,
              });
          const previous = predecessor?.licenseId === context.licenseId ? predecessor : null;
          const lifecycle = nextLeaseLifecycle(previous);
          const leaseId = id();
          const expiresAt = context.licenseExpiresAt ?? new Date(now.getTime() + THIRTY_DAYS_MS);
          const payload: CommercialLeasePayload = Object.freeze({
            license_id: context.licenseId,
            lease_id: leaseId,
            generation: lifecycle.generation,
            server_revision: lifecycle.serverRevision,
            product_id: context.productId,
            installation_id: installationId,
            device_id: identity.deviceId,
            version,
            issuer,
            issued_at: now.toISOString(),
            not_before: now.toISOString(),
            expires_at: expiresAt.toISOString(),
            key_id: signingKey.keyId,
            algorithm: "Ed25519" as const,
            revoked: false,
            superseded_by: null,
          });
          const lease = await dependencies.signer.issue(payload, signingKey);
          const record = await transaction.createLease({
            id: id(),
            licenseId: context.licenseId,
            leaseId,
            generation: lifecycle.generation,
            serverRevision: lifecycle.serverRevision,
            installationId,
            deviceId: identity.deviceId,
            version,
            action,
            operationId,
            signerKeyId: signingKey.keyId,
            expiresAt,
            leasePayload: lease.payload,
            leaseSignature: lease.signature,
            issuedAt: now,
          });

          if (previous) {
            await transaction.supersedeLease({
              previousLeaseRecordId: previous.id,
              supersededById: record.id,
            });
          }
          await transaction.completeOperation({
            operationId,
            resultLeaseId: leaseId,
            completedAt: now,
          });

          return Object.freeze({ lease });
        });
      } catch (error) {
        if (attempt === 0 && retryableTransactionError(error)) continue;
        throw error;
      }
    }

    throw new Error("COMMERCIAL_OPERATION_FAILED");
  };

  return Object.freeze({ issue });
}

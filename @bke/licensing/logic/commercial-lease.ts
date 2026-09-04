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
    (context.licenseExpiresAt && context.licenseExpiresAt.getTime() < now.getTime())
  ) {
    throw new Error("INVALID_LICENSE");
  }
  return context;
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
      try {
        const context = validateLicenseContext(
          await dependencies.contexts.resolve({
            licenseKeyHash: dependencies.hasher.hash(input.licenseKey),
            productVersion: input.productVersion,
          }),
          now,
        );

        return await dependencies.store.withTransaction(async (transaction) => {
          let operation = await transaction.findOperation(input.operationId);
          if (!operation) {
            if (input.action !== "ACTIVATION") throw new Error("COMMERCIAL_OPERATION_REQUIRED");
            operation = await transaction.createOperation({
              id: id(),
              operationId: input.operationId,
              licenseId: context.licenseId,
              action: "ACTIVATION",
              createdAt: now,
            });
          } else {
            if (operation.licenseId !== context.licenseId) {
              throw new Error("OPERATION_LICENSE_MISMATCH");
            }

            if (operation.status === "COMPLETED" && operation.resultLeaseId) {
              if (
                (metadataValue(operation.metadata, "installationId") !== undefined &&
                  metadataValue(operation.metadata, "installationId") !== input.installationId) ||
                (metadataValue(operation.metadata, "deviceId") !== undefined &&
                  metadataValue(operation.metadata, "deviceId") !== input.deviceId) ||
                (input.predecessorLeaseId &&
                  metadataValue(operation.metadata, "predecessorLeaseId") !== input.predecessorLeaseId)
              ) {
                throw new Error("OPERATION_INPUT_MISMATCH");
              }
              const prior = await transaction.findLease(operation.resultLeaseId);
              if (!prior) throw new Error("COMMERCIAL_LEASE_NOT_FOUND");
              return Object.freeze({ lease: replayEnvelope(prior) });
            }

            if (input.action && input.action !== operation.action) {
              throw new Error("OPERATION_ACTION_MISMATCH");
            }
          }

          const action = actionFrom(operation.action);
          if (action === "RENEWAL" && context.subscriptionStatus !== "ACTIVE") {
            throw new Error("RENEWAL_NOT_ELIGIBLE");
          }

          if (action === "TRANSFER") {
            const policyId = metadataValue(operation.metadata, "policyId") ?? "";
            if (!policyId) throw new Error("TRANSFER_NOT_ALLOWED");
            if (!(await dependencies.transfers.isTransferAllowed({ licenseId: context.licenseId, policyId }))) {
              throw new Error("TRANSFER_NOT_ALLOWED");
            }
          }

          const version = requireProductVersion(input.productVersion);
          if (!context.productVersionEligible) throw new Error("VERSION_NOT_ELIGIBLE");
          if (!context.versionAccepted) throw new Error("VERSION_NOT_ACCEPTED");
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
                installationId: input.installationId,
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
            installation_id: input.installationId,
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
            installationId: input.installationId,
            deviceId: identity.deviceId,
            version,
            action,
            operationId: input.operationId,
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
            operationId: input.operationId,
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

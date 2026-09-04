import type {
  CommercialLeaseAction,
  CommercialLeaseEnvelope,
  CommercialLeasePayload,
  CommercialLicenseContext,
} from "../contracts/commercial-lease.contract";
import type { CommercialSigningKeyRecord } from "./commercial-signing-registry";

export type CommercialActivationRecord = Readonly<{
  id: string;
  licenseId: string;
  deviceHash: string;
  machineIdHint: string | null;
  label: string | null;
  operatingSystem: string | null;
  architecture: string | null;
  active: boolean;
}>;

export type CommercialLeaseRecord = Readonly<{
  id: string;
  licenseId: string;
  leaseId: string;
  generation: number;
  serverRevision: number;
  installationId: string;
  deviceId: string;
  version: string;
  status: string;
  action: string;
  operationId: string | null;
  signerKeyId: string | null;
  expiresAt: Date | null;
  leasePayload: string | null;
  leaseSignature: string | null;
  supersededById: string | null;
  issuedAt: Date;
}>;

export type CommercialOperationMetadata = Readonly<Record<string, unknown>>;

export type CommercialOperationRecord = Readonly<{
  id: string;
  operationId: string;
  licenseId: string | null;
  action: string;
  status: string;
  resultLeaseId: string | null;
  metadata: CommercialOperationMetadata;
}>;

export interface CommercialLeaseTransaction {
  findOperation(operationId: string): Promise<CommercialOperationRecord | null>;
  createOperation(input: Readonly<{
    id: string;
    operationId: string;
    licenseId: string;
    action: CommercialLeaseAction;
    createdAt: Date;
  }>): Promise<CommercialOperationRecord>;
  completeOperation(input: Readonly<{
    operationId: string;
    resultLeaseId: string;
    completedAt: Date;
  }>): Promise<void>;
  findLease(leaseId: string): Promise<CommercialLeaseRecord | null>;
  findLatestLease(input: Readonly<{
    licenseId: string;
    installationId: string;
    deviceId: string;
  }>): Promise<CommercialLeaseRecord | null>;
  findActivationByDeviceHash(
    licenseId: string,
    deviceHash: string,
  ): Promise<CommercialActivationRecord | null>;
  countActiveActivations(licenseId: string): Promise<number>;
  upsertActivation(input: Readonly<{
    id: string;
    licenseId: string;
    deviceHash: string;
    machineIdHint: string;
    label?: string;
    operatingSystem?: string;
    architecture?: string;
    now: Date;
  }>): Promise<CommercialActivationRecord>;
  touchActivation(input: Readonly<{
    id: string;
    label?: string;
    operatingSystem?: string;
    architecture?: string;
    now: Date;
  }>): Promise<CommercialActivationRecord>;
  createLease(input: Readonly<{
    id: string;
    licenseId: string;
    leaseId: string;
    generation: number;
    serverRevision: number;
    installationId: string;
    deviceId: string;
    version: string;
    action: CommercialLeaseAction;
    operationId: string;
    signerKeyId: string;
    expiresAt: Date;
    leasePayload: string;
    leaseSignature: string;
    issuedAt: Date;
  }>): Promise<CommercialLeaseRecord>;
  supersedeLease(input: Readonly<{
    previousLeaseRecordId: string;
    supersededById: string;
  }>): Promise<void>;
}

export interface CommercialLeaseStore {
  withTransaction<T>(work: (transaction: CommercialLeaseTransaction) => Promise<T>): Promise<T>;
}

export interface CommercialLicenseContextProvider {
  resolve(input: Readonly<{
    licenseKeyHash: string;
    productVersion: string;
  }>): Promise<CommercialLicenseContext | null>;
}

export interface CommercialTransferEligibilityProvider {
  isTransferAllowed(input: Readonly<{
    licenseId: string;
    policyId: string;
  }>): Promise<boolean>;
}

export interface CommercialSigningKeyProvider {
  ensure(): Promise<void>;
  active(): Promise<CommercialSigningKeyRecord>;
}

export interface CommercialLeaseSigner {
  issue(
    payload: CommercialLeasePayload,
    key: CommercialSigningKeyRecord,
  ): Promise<CommercialLeaseEnvelope>;
}

export interface CommercialLicenseKeyHasher {
  hash(licenseKey: string): string;
}

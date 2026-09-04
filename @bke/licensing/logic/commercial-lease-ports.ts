import type {
  CommercialLeaseAction,
  CommercialLeaseClaims,
  CommercialLicenseContext,
} from "../contracts/commercial-lease.contract";
import type { CommercialSigningKeyRecord } from "./commercial-signing-registry";

export type CommercialActivationRecord = Readonly<{
  id: string;
  licenseId: string;
  deviceHash: string;
  installationId: string | null;
  clientVersion: string | null;
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
  refreshAfter: Date | null;
  expiresAt: Date | null;
  issuedAt: Date;
}>;

export type CommercialOperationMetadata = Readonly<{
  fingerprint: string;
  clientVersion: string;
  requestedAction: CommercialLeaseAction;
  decision?: "ISSUED" | "REFRESHED" | "UNCHANGED";
  reasonCode?: string;
}>;

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
    metadata: CommercialOperationMetadata;
    createdAt: Date;
  }>): Promise<CommercialOperationRecord>;
  completeOperation(input: Readonly<{
    operationId: string;
    resultLeaseId: string;
    metadata: CommercialOperationMetadata;
    completedAt: Date;
  }>): Promise<void>;
  findLease(leaseId: string): Promise<CommercialLeaseRecord | null>;
  findActivationByInstallation(licenseId: string, installationId: string): Promise<CommercialActivationRecord | null>;
  findActivationByFingerprint(licenseId: string, fingerprint: string): Promise<CommercialActivationRecord | null>;
  countActiveActivations(licenseId: string): Promise<number>;
  createActivation(input: Readonly<{
    id: string;
    licenseId: string;
    fingerprint: string;
    installationId: string;
    clientVersion: string;
    isVirtualMachine: boolean;
    isContainer: boolean;
    now: Date;
  }>): Promise<CommercialActivationRecord>;
  updateActivation(input: Readonly<{
    id: string;
    fingerprint: string;
    installationId: string;
    clientVersion: string;
    isVirtualMachine: boolean;
    isContainer: boolean;
    now: Date;
  }>): Promise<CommercialActivationRecord>;
  findLatestActiveLease(licenseId: string, deviceId: string): Promise<CommercialLeaseRecord | null>;
  markActiveLeasesReplaced(input: Readonly<{
    licenseId: string;
    deviceId: string;
    supersededById: string;
    replacedAt: Date;
  }>): Promise<void>;
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
    refreshAfter: Date;
    expiresAt: Date;
    issuedAt: Date;
  }>): Promise<CommercialLeaseRecord>;
}

export interface CommercialLeaseStore {
  withTransaction<T>(work: (transaction: CommercialLeaseTransaction) => Promise<T>): Promise<T>;
}

export interface CommercialLicenseContextProvider {
  resolve(input: Readonly<{ licenseKeyHash: string; clientVersion: string }>): Promise<CommercialLicenseContext | null>;
}

export interface CommercialSigningKeyProvider {
  active(now: Date): Promise<CommercialSigningKeyRecord>;
  resolve(keyId: string, now: Date): Promise<CommercialSigningKeyRecord>;
}

export interface CommercialLeaseSigner {
  sign(claims: CommercialLeaseClaims, key: CommercialSigningKeyRecord): Promise<string>;
}

export interface CommercialLicenseKeyHasher {
  hash(licenseKey: string): string;
}

export interface CommercialDeviceClassifier {
  classify(fingerprint: string): Readonly<{ isVirtualMachine: boolean; isContainer: boolean }>;
}

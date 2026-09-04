import { Client } from "pg";
import type {
  CommercialActivationRecord,
  CommercialLeaseRecord,
  CommercialLeaseStore,
  CommercialLeaseTransaction,
  CommercialOperationMetadata,
  CommercialOperationRecord,
} from "../../logic/commercial-lease-ports";

type ActivationRow = {
  id: string;
  licenseId: string;
  deviceHash: string;
  installationId: string | null;
  clientVersion: string | null;
  active: boolean;
};

type LeaseRow = {
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
};

type OperationRow = {
  id: string;
  operationId: string;
  licenseId: string | null;
  action: string;
  status: string;
  resultLeaseId: string | null;
  metadata: CommercialOperationMetadata;
};

function activation(row: ActivationRow | undefined): CommercialActivationRecord | null {
  return row ? Object.freeze({ ...row }) : null;
}

function lease(row: LeaseRow | undefined): CommercialLeaseRecord | null {
  return row ? Object.freeze({ ...row }) : null;
}

function operation(row: OperationRow | undefined): CommercialOperationRecord | null {
  return row ? Object.freeze({ ...row }) : null;
}

function transactionFor(client: Client): CommercialLeaseTransaction {
  return Object.freeze({
    async findOperation(operationId) {
      const result = await client.query<OperationRow>(
        `SELECT "id", "operationId", "licenseId", "action", "status", "resultLeaseId", "metadata"
           FROM "CommercialLeaseOperation"
          WHERE "operationId" = $1`,
        [operationId],
      );
      return operation(result.rows[0]);
    },

    async createOperation(input) {
      const result = await client.query<OperationRow>(
        `INSERT INTO "CommercialLeaseOperation"
          ("id", "operationId", "licenseId", "action", "status", "metadata", "createdAt")
         VALUES ($1, $2, $3, $4, 'PENDING', $5::jsonb, $6)
         RETURNING "id", "operationId", "licenseId", "action", "status", "resultLeaseId", "metadata"`,
        [
          input.id,
          input.operationId,
          input.licenseId,
          input.action,
          JSON.stringify(input.metadata),
          input.createdAt,
        ],
      );
      const record = operation(result.rows[0]);
      if (!record) throw new Error("COMMERCIAL_OPERATION_CREATE_FAILED");
      return record;
    },

    async completeOperation(input) {
      await client.query(
        `UPDATE "CommercialLeaseOperation"
            SET "status" = 'COMPLETED',
                "resultLeaseId" = $2,
                "metadata" = $3::jsonb,
                "completedAt" = $4
          WHERE "operationId" = $1`,
        [input.operationId, input.resultLeaseId, JSON.stringify(input.metadata), input.completedAt],
      );
    },

    async findLease(leaseId) {
      const result = await client.query<LeaseRow>(
        `SELECT "id", "licenseId", "leaseId", "generation", "serverRevision", "installationId", "deviceId",
                "version", "status", "action", "operationId", "signerKeyId", "refreshAfter", "expiresAt", "issuedAt"
           FROM "LicenseLeaseRecord"
          WHERE "leaseId" = $1`,
        [leaseId],
      );
      return lease(result.rows[0]);
    },

    async findActivationByInstallation(licenseId, installationId) {
      const result = await client.query<ActivationRow>(
        `SELECT "id", "licenseId", "deviceHash", "installationId", "clientVersion", "active"
           FROM "DeviceActivation"
          WHERE "licenseId" = $1 AND "installationId" = $2 AND "active" = true
          LIMIT 1`,
        [licenseId, installationId],
      );
      return activation(result.rows[0]);
    },

    async findActivationByFingerprint(licenseId, fingerprint) {
      const result = await client.query<ActivationRow>(
        `SELECT "id", "licenseId", "deviceHash", "installationId", "clientVersion", "active"
           FROM "DeviceActivation"
          WHERE "licenseId" = $1 AND "deviceHash" = $2 AND "active" = true
          LIMIT 1`,
        [licenseId, fingerprint],
      );
      return activation(result.rows[0]);
    },

    async countActiveActivations(licenseId) {
      const result = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS "count"
           FROM "DeviceActivation"
          WHERE "licenseId" = $1 AND "active" = true`,
        [licenseId],
      );
      return Number(result.rows[0]?.count ?? "0");
    },

    async createActivation(input) {
      const result = await client.query<ActivationRow>(
        `INSERT INTO "DeviceActivation"
          ("id", "licenseId", "deviceHash", "installationId", "clientVersion", "isVirtualMachine", "isContainer", "lastSeenAt", "active", "activatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $8)
         RETURNING "id", "licenseId", "deviceHash", "installationId", "clientVersion", "active"`,
        [
          input.id,
          input.licenseId,
          input.fingerprint,
          input.installationId,
          input.clientVersion,
          input.isVirtualMachine,
          input.isContainer,
          input.now,
        ],
      );
      const record = activation(result.rows[0]);
      if (!record) throw new Error("DEVICE_ACTIVATION_CREATE_FAILED");
      return record;
    },

    async updateActivation(input) {
      const result = await client.query<ActivationRow>(
        `UPDATE "DeviceActivation"
            SET "deviceHash" = $2,
                "installationId" = $3,
                "clientVersion" = $4,
                "isVirtualMachine" = $5,
                "isContainer" = $6,
                "lastSeenAt" = $7,
                "active" = true,
                "deactivatedAt" = NULL
          WHERE "id" = $1
         RETURNING "id", "licenseId", "deviceHash", "installationId", "clientVersion", "active"`,
        [
          input.id,
          input.fingerprint,
          input.installationId,
          input.clientVersion,
          input.isVirtualMachine,
          input.isContainer,
          input.now,
        ],
      );
      const record = activation(result.rows[0]);
      if (!record) throw new Error("DEVICE_ACTIVATION_NOT_FOUND");
      return record;
    },

    async findLatestActiveLease(licenseId, deviceId) {
      const result = await client.query<LeaseRow>(
        `SELECT "id", "licenseId", "leaseId", "generation", "serverRevision", "installationId", "deviceId",
                "version", "status", "action", "operationId", "signerKeyId", "refreshAfter", "expiresAt", "issuedAt"
           FROM "LicenseLeaseRecord"
          WHERE "licenseId" = $1 AND "deviceId" = $2 AND "status" = 'ACTIVE'
          ORDER BY "generation" DESC, "serverRevision" DESC, "issuedAt" DESC
          LIMIT 1
          FOR UPDATE`,
        [licenseId, deviceId],
      );
      return lease(result.rows[0]);
    },

    async markActiveLeasesReplaced(input) {
      await client.query(
        `UPDATE "LicenseLeaseRecord"
            SET "status" = 'REPLACED', "supersededById" = $3
          WHERE "licenseId" = $1
            AND "deviceId" = $2
            AND "status" = 'ACTIVE'
            AND "id" <> $3`,
        [input.licenseId, input.deviceId, input.supersededById],
      );
    },

    async createLease(input) {
      const result = await client.query<LeaseRow>(
        `INSERT INTO "LicenseLeaseRecord"
          ("id", "licenseId", "leaseId", "generation", "serverRevision", "installationId", "deviceId", "version",
           "status", "action", "operationId", "signerKeyId", "refreshAfter", "expiresAt", "issuedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', $9, $10, $11, $12, $13, $14)
         RETURNING "id", "licenseId", "leaseId", "generation", "serverRevision", "installationId", "deviceId",
                   "version", "status", "action", "operationId", "signerKeyId", "refreshAfter", "expiresAt", "issuedAt"`,
        [
          input.id,
          input.licenseId,
          input.leaseId,
          input.generation,
          input.serverRevision,
          input.installationId,
          input.deviceId,
          input.version,
          input.action,
          input.operationId,
          input.signerKeyId,
          input.refreshAfter,
          input.expiresAt,
          input.issuedAt,
        ],
      );
      const record = lease(result.rows[0]);
      if (!record) throw new Error("COMMERCIAL_LEASE_CREATE_FAILED");
      return record;
    },
  });
}

export function createPostgresCommercialLeaseStore(connectionString: string): CommercialLeaseStore {
  const normalized = connectionString.trim();
  if (!normalized) throw new Error("Licensing PostgreSQL connection string is required.");

  return Object.freeze({
    async withTransaction<T>(work: (transaction: CommercialLeaseTransaction) => Promise<T>): Promise<T> {
      const client = new Client({ connectionString: normalized });
      await client.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        const result = await work(transactionFor(client));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Preserve the original transaction failure.
        }
        throw error;
      } finally {
        await client.end();
      }
    },
  });
}

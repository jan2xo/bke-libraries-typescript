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
  machineIdHint: string | null;
  label: string | null;
  operatingSystem: string | null;
  architecture: string | null;
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
  expiresAt: Date | null;
  leasePayload: string | null;
  leaseSignature: string | null;
  supersededById: string | null;
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
  return Object.freeze<CommercialLeaseTransaction>({
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
          ("id", "operationId", "licenseId", "action", "status", "createdAt")
         VALUES ($1, $2, $3, $4, 'PENDING', $5)
         RETURNING "id", "operationId", "licenseId", "action", "status", "resultLeaseId", "metadata"`,
        [input.id, input.operationId, input.licenseId, input.action, input.createdAt],
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
                "completedAt" = $3
          WHERE "operationId" = $1`,
        [input.operationId, input.resultLeaseId, input.completedAt],
      );
    },

    async findLease(leaseId) {
      const result = await client.query<LeaseRow>(
        `SELECT "id", "licenseId", "leaseId", "generation", "serverRevision", "installationId", "deviceId",
                "version", "status", "action", "operationId", "signerKeyId", "expiresAt", "leasePayload",
                "leaseSignature", "supersededById", "issuedAt"
           FROM "LicenseLeaseRecord"
          WHERE "leaseId" = $1`,
        [leaseId],
      );
      return lease(result.rows[0]);
    },

    async findLatestLease(input) {
      const result = await client.query<LeaseRow>(
        `SELECT "id", "licenseId", "leaseId", "generation", "serverRevision", "installationId", "deviceId",
                "version", "status", "action", "operationId", "signerKeyId", "expiresAt", "leasePayload",
                "leaseSignature", "supersededById", "issuedAt"
           FROM "LicenseLeaseRecord"
          WHERE "licenseId" = $1 AND "installationId" = $2 AND "deviceId" = $3
          ORDER BY "generation" DESC, "serverRevision" DESC
          LIMIT 1
          FOR UPDATE`,
        [input.licenseId, input.installationId, input.deviceId],
      );
      return lease(result.rows[0]);
    },

    async findActivationByDeviceHash(licenseId, deviceHash) {
      const result = await client.query<ActivationRow>(
        `SELECT "id", "licenseId", "deviceHash", "machineIdHint", "label", "operatingSystem", "architecture", "active"
           FROM "DeviceActivation"
          WHERE "licenseId" = $1 AND "deviceHash" = $2
          LIMIT 1`,
        [licenseId, deviceHash],
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

    async upsertActivation(input) {
      const result = await client.query<ActivationRow>(
        `INSERT INTO "DeviceActivation"
          ("id", "licenseId", "deviceHash", "machineIdHint", "label", "operatingSystem", "architecture",
           "lastSeenAt", "active", "activatedAt", "deactivatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $8, NULL)
         ON CONFLICT ("licenseId", "deviceHash") DO UPDATE
           SET "active" = true,
               "deactivatedAt" = NULL,
               "lastSeenAt" = EXCLUDED."lastSeenAt",
               "label" = COALESCE(EXCLUDED."label", "DeviceActivation"."label"),
               "operatingSystem" = COALESCE(EXCLUDED."operatingSystem", "DeviceActivation"."operatingSystem"),
               "architecture" = COALESCE(EXCLUDED."architecture", "DeviceActivation"."architecture")
         RETURNING "id", "licenseId", "deviceHash", "machineIdHint", "label", "operatingSystem", "architecture", "active"`,
        [
          input.id,
          input.licenseId,
          input.deviceHash,
          input.machineIdHint,
          input.label ?? null,
          input.operatingSystem ?? null,
          input.architecture ?? null,
          input.now,
        ],
      );
      const record = activation(result.rows[0]);
      if (!record) throw new Error("DEVICE_ACTIVATION_UPSERT_FAILED");
      return record;
    },

    async touchActivation(input) {
      const result = await client.query<ActivationRow>(
        `UPDATE "DeviceActivation"
            SET "lastSeenAt" = $2,
                "label" = COALESCE($3, "label"),
                "operatingSystem" = COALESCE($4, "operatingSystem"),
                "architecture" = COALESCE($5, "architecture")
          WHERE "id" = $1
         RETURNING "id", "licenseId", "deviceHash", "machineIdHint", "label", "operatingSystem", "architecture", "active"`,
        [input.id, input.now, input.label ?? null, input.operatingSystem ?? null, input.architecture ?? null],
      );
      const record = activation(result.rows[0]);
      if (!record) throw new Error("DEVICE_ACTIVATION_NOT_FOUND");
      return record;
    },

    async createLease(input) {
      const result = await client.query<LeaseRow>(
        `INSERT INTO "LicenseLeaseRecord"
          ("id", "licenseId", "leaseId", "generation", "serverRevision", "installationId", "deviceId", "version",
           "status", "action", "operationId", "signerKeyId", "expiresAt", "leasePayload", "leaseSignature", "issuedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', $9, $10, $11, $12, $13, $14, $15)
         RETURNING "id", "licenseId", "leaseId", "generation", "serverRevision", "installationId", "deviceId",
                   "version", "status", "action", "operationId", "signerKeyId", "expiresAt", "leasePayload",
                   "leaseSignature", "supersededById", "issuedAt"`,
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
          input.expiresAt,
          input.leasePayload,
          input.leaseSignature,
          input.issuedAt,
        ],
      );
      const record = lease(result.rows[0]);
      if (!record) throw new Error("COMMERCIAL_LEASE_CREATE_FAILED");
      return record;
    },

    async supersedeLease(input) {
      await client.query(
        `UPDATE "LicenseLeaseRecord"
            SET "status" = 'SUPERSEDED', "supersededById" = $2
          WHERE "id" = $1`,
        [input.previousLeaseRecordId, input.supersededById],
      );
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

import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type {
  AccountsPrivacyRequestSnapshot,
} from "../../contracts/privacy-request-management.contract";
import type {
  AccountsPrivacyRequestManagementRepository,
} from "../../logic/privacy-request-management";

type CreateInput = Parameters<AccountsPrivacyRequestManagementRepository["create"]>[0];
type TransitionInput = Parameters<AccountsPrivacyRequestManagementRepository["transition"]>[0];

async function withClient<T>(
  connectionString: string,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

export function createPostgresAccountsPrivacyRequestManagementRepository(
  connectionString: string,
): AccountsPrivacyRequestManagementRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Accounts PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async create(input: CreateInput): Promise<AccountsPrivacyRequestSnapshot> {
      return withClient(normalizedConnectionString, async (client) => {
        await client.query("BEGIN");
        try {
          const requestId = randomUUID();
          const eventId = randomUUID();
          const result = await client.query<AccountsPrivacyRequestSnapshot>(
            `INSERT INTO "PrivacyRequest"
               ("id", "userId", "customerAccountId", "requestType", "status", "summary", "ipAddress", "userAgent")
             VALUES ($1, $2, $3, $4, 'OPEN', $5, $6, $7)
             RETURNING "id", "userId", "customerAccountId", "requestType", "status", "summary",
                       "responseSummary", "reviewedById", "reviewedAt", "closedAt", "ipAddress", "userAgent"`,
            [
              requestId,
              input.userId,
              input.customerAccountId,
              input.requestType,
              input.summary,
              input.ipAddress,
              input.userAgent,
            ],
          );
          await client.query(
            `INSERT INTO "PrivacyRequestEvent"
               ("id", "privacyRequestId", "actorId", "eventType", "fromStatus", "toStatus", "metadata")
             VALUES ($1, $2, $3, 'CREATED', NULL, 'OPEN', $4::jsonb)`,
            [
              eventId,
              requestId,
              input.userId,
              JSON.stringify({ requestType: input.requestType }),
            ],
          );
          await client.query("COMMIT");
          const row = result.rows[0];
          if (!row) throw new Error("Accounts privacy request creation returned no row.");
          return row;
        } catch (error) {
          await client.query("ROLLBACK").catch(() => undefined);
          throw error;
        }
      });
    },

    async findById(requestId: string): Promise<AccountsPrivacyRequestSnapshot | null> {
      return withClient(normalizedConnectionString, async (client) => {
        const result = await client.query<AccountsPrivacyRequestSnapshot>(
          `SELECT "id", "userId", "customerAccountId", "requestType", "status", "summary",
                  "responseSummary", "reviewedById", "reviewedAt", "closedAt", "ipAddress", "userAgent"
             FROM "PrivacyRequest"
            WHERE "id" = $1`,
          [requestId],
        );
        return result.rows[0] ?? null;
      });
    },

    async transition(input: TransitionInput): Promise<AccountsPrivacyRequestSnapshot> {
      return withClient(normalizedConnectionString, async (client) => {
        await client.query("BEGIN");
        try {
          const result = await client.query<AccountsPrivacyRequestSnapshot>(
            `UPDATE "PrivacyRequest"
                SET "status" = $1,
                    "responseSummary" = $2,
                    "reviewedById" = $3,
                    "reviewedAt" = $4,
                    "closedAt" = $5,
                    "updatedAt" = CURRENT_TIMESTAMP
              WHERE "id" = $6 AND "status" = $7
              RETURNING "id", "userId", "customerAccountId", "requestType", "status", "summary",
                        "responseSummary", "reviewedById", "reviewedAt", "closedAt", "ipAddress", "userAgent"`,
            [
              input.toStatus,
              input.responseSummary,
              input.actorId,
              input.reviewedAt,
              input.closedAt,
              input.requestId,
              input.fromStatus,
            ],
          );
          const row = result.rows[0];
          if (!row) {
            throw new Error("Accounts privacy request transition lost optimistic status match.");
          }
          await client.query(
            `INSERT INTO "PrivacyRequestEvent"
               ("id", "privacyRequestId", "actorId", "eventType", "fromStatus", "toStatus", "metadata")
             VALUES ($1, $2, $3, 'STATUS_CHANGED', $4, $5, $6::jsonb)`,
            [
              randomUUID(),
              input.requestId,
              input.actorId,
              input.fromStatus,
              input.toStatus,
              JSON.stringify({ responseSummaryLength: input.responseSummary.trim().length }),
            ],
          );
          await client.query("COMMIT");
          return row;
        } catch (error) {
          await client.query("ROLLBACK").catch(() => undefined);
          throw error;
        }
      });
    },
  });
}

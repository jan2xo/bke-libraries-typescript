import { Client } from "pg";
import type {
  IdentityLifecycleState,
  IdentityPrincipal,
  IdentityRole,
} from "../../contracts/identity.contract";
import type { IdentityGoogleIdentityRepository } from "../../logic/google-identity-repository";

type PrincipalRow = {
  id: string;
  email: string;
  name: string | null;
  emailVerified: Date | null;
  role: IdentityRole;
  establishedAt: Date;
  suspendedAt: Date | null;
  lifecycleState: IdentityLifecycleState;
};
type UserStateRow = {
  suspendedAt: Date | null;
  lifecycleState: IdentityLifecycleState;
};
type BindingRow = { userId: string; subject: string };
type TransactionClient = Pick<Client, "query">;

const PRINCIPAL_PROJECTION = `
  SELECT u."id", u."email", u."name", u."emailVerified", u."role",
         u."createdAt" AS "establishedAt", u."suspendedAt", u."lifecycleState"
    FROM "User" u
`;
const AUTHENTICATION_PROJECTION = `
  SELECT u."id", u."email", u."name", u."emailVerified", u."role",
         u."createdAt" AS "establishedAt", u."suspendedAt", u."lifecycleState",
         (m."enabledAt" IS NOT NULL) AS "mfaEnabled"
    FROM "User" u
`;

function toPrincipal(row: PrincipalRow): IdentityPrincipal {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    emailVerified: row.emailVerified,
    role: row.role,
    establishedAt: row.establishedAt,
    suspendedAt: row.suspendedAt,
    lifecycleState: row.lifecycleState,
  };
}

/**
 * Uses the caller's active transaction. The host must authorize the userId
 * before calling this repository, and owns commit/rollback.
 */
export function createTransactionBoundPostgresGoogleIdentityRepository(
  client: TransactionClient,
): IdentityGoogleIdentityRepository {
  return createGoogleIdentityRepository(client);
}

export function createPostgresIdentityGoogleIdentityRepository(
  connectionString: string,
): IdentityGoogleIdentityRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Identity PostgreSQL connection string is required.");
  }

  return createGoogleIdentityRepositoryFactory(async () => {
    const client = new Client({ connectionString: normalizedConnectionString });
    await client.connect();
    return client;
  }, true);
}

function createGoogleIdentityRepository(
  client: TransactionClient,
): IdentityGoogleIdentityRepository {
  return createGoogleIdentityRepositoryFactory(async () => client, false);
}

function createGoogleIdentityRepositoryFactory(
  getClient: () => Promise<TransactionClient>,
  ownsConnection: boolean,
): IdentityGoogleIdentityRepository {
  const transactionBound = !ownsConnection;
  return Object.freeze({
    async bindSubject(userId: string, subject: string) {
      const client = await getClient();
      if (!transactionBound) await client.query("BEGIN");
      try {
        const user = await client.query<UserStateRow>(
          `SELECT "suspendedAt", "lifecycleState"
             FROM "User"
            WHERE "id" = $1
            FOR UPDATE`,
          [userId],
        );
        const state = user.rows[0];
        if (!state) {
          if (!transactionBound) await client.query("ROLLBACK");
          return { status: "PRINCIPAL_NOT_FOUND" as const };
        }
        if (state.suspendedAt || state.lifecycleState !== "ACTIVE") {
          if (!transactionBound) await client.query("ROLLBACK");
          return { status: "ACCOUNT_NOT_ACTIVE" as const };
        }

        const inserted = await client.query(
          `INSERT INTO "GoogleIdentity" ("userId", "subject", "updatedAt")
           VALUES ($1, $2, NOW())
           ON CONFLICT DO NOTHING`,
          [userId, subject],
        );
        if ((inserted.rowCount ?? 0) === 1) {
          if (!transactionBound) await client.query("COMMIT");
          return { status: "BOUND" as const };
        }

        const existing = await client.query<BindingRow>(
          `SELECT "userId", "subject"
             FROM "GoogleIdentity"
            WHERE "userId" = $1 OR "subject" = $2
            FOR UPDATE`,
          [userId, subject],
        );
        if (!transactionBound) await client.query("COMMIT");
        if (existing.rows.some((row) => row.userId === userId && row.subject === subject)) {
          return { status: "ALREADY_BOUND" as const };
        }
        if (existing.rows.some((row) => row.subject === subject)) {
          return { status: "SUBJECT_ALREADY_BOUND" as const };
        }
        return { status: "USER_ALREADY_BOUND" as const };
      } catch (error) {
        if (!transactionBound) await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    },

    async findAuthenticationBySubject(subject: string) {
      const client = await getClient();
      try {
        const result = await client.query<PrincipalRow & { mfaEnabled: boolean }>(
          `${AUTHENTICATION_PROJECTION}
             JOIN "GoogleIdentity" g ON g."userId" = u."id"
             LEFT JOIN "AdministratorMfaMethod" m ON m."userId" = u."id"
            WHERE g."subject" = $1
            LIMIT 1`,
          [subject],
        );
        const row = result.rows[0];
        return row ? { principal: toPrincipal(row), mfaEnabled: row.mfaEnabled } : null;
      } finally {
        if (ownsConnection && client instanceof Client) await client.end();
      }
    },

    async findPrincipalBySubject(subject: string) {
      const client = await getClient();
      try {
        const result = await client.query<PrincipalRow>(
          `${PRINCIPAL_PROJECTION}
             JOIN "GoogleIdentity" g ON g."userId" = u."id"
            WHERE g."subject" = $1
            LIMIT 1`,
          [subject],
        );
        return result.rows[0] ? toPrincipal(result.rows[0]) : null;
      } finally {
        if (ownsConnection && client instanceof Client) await client.end();
      }
    },
  });
}

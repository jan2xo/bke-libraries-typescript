import { Client } from "pg";
import type {
  IdentityLifecycleState,
  IdentityPrincipal,
  IdentityRole,
} from "../../contracts/identity.contract";
import type {
  IdentityPasswordAuthenticationRecord,
  IdentityRepository,
} from "../../logic/identity-repository";

type IdentityRow = {
  id: string;
  email: string;
  name: string | null;
  emailVerified: Date | null;
  role: IdentityRole;
  suspendedAt: Date | null;
  lifecycleState: IdentityLifecycleState;
};

type IdentityAuthenticationRow = IdentityRow & {
  passwordHash: string;
  administratorMfaEnabled: boolean;
};

const principalProjection = `
  SELECT
    "id",
    "email",
    "name",
    "emailVerified",
    "role",
    "suspendedAt",
    "lifecycleState"
  FROM "User"
`;

function toPrincipal(row: IdentityRow): IdentityPrincipal {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    emailVerified: row.emailVerified,
    role: row.role,
    suspendedAt: row.suspendedAt,
    lifecycleState: row.lifecycleState,
  };
}

async function findOne(
  connectionString: string,
  predicate: string,
  value: string,
): Promise<IdentityPrincipal | null> {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const result = await client.query<IdentityRow>(
      `${principalProjection} WHERE ${predicate} = $1 LIMIT 1`,
      [value],
    );
    return result.rows[0] ? toPrincipal(result.rows[0]) : null;
  } finally {
    await client.end();
  }
}

async function findPasswordAuthentication(
  connectionString: string,
  email: string,
): Promise<IdentityPasswordAuthenticationRecord | null> {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const result = await client.query<IdentityAuthenticationRow>(
      `SELECT
         u."id" AS "id",
         u."email" AS "email",
         u."name" AS "name",
         u."emailVerified" AS "emailVerified",
         u."role" AS "role",
         u."suspendedAt" AS "suspendedAt",
         u."lifecycleState" AS "lifecycleState",
         credential."passwordHash" AS "passwordHash",
         (administrator_mfa."enabledAt" IS NOT NULL) AS "administratorMfaEnabled"
       FROM "User" u
       INNER JOIN "PasswordCredential" credential
               ON credential."userId" = u."id"
       LEFT JOIN "AdministratorMfaMethod" administrator_mfa
              ON administrator_mfa."userId" = u."id"
      WHERE u."email" = $1
      LIMIT 1`,
      [email],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      principal: toPrincipal(row),
      passwordHash: row.passwordHash,
      administratorMfaEnabled: row.administratorMfaEnabled,
    };
  } finally {
    await client.end();
  }
}

export function createPostgresIdentityRepository(
  connectionString: string,
): IdentityRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Identity PostgreSQL connection string is required.");
  }

  return Object.freeze({
    findById(userId: string) {
      return findOne(normalizedConnectionString, '"id"', userId);
    },
    findByEmail(email: string) {
      return findOne(normalizedConnectionString, '"email"', email);
    },
    findPasswordAuthenticationByEmail(email: string) {
      return findPasswordAuthentication(normalizedConnectionString, email);
    },
  });
}

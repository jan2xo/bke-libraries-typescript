import { Client } from "pg";
import { createAccountsAccountAccessCapability } from "../logic/account-access";
import { createAccountsOrganizationDetailCapability } from "../logic/organization-detail";
import { createPostgresAccountsAccountAccessRepository } from "../prisma/repositories/postgres-account-access-repository";
import { createPostgresAccountsOrganizationDetailRepository } from "../prisma/repositories/postgres-organization-detail-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Accounts organization detail certification.");
}

const client = new Client({ connectionString });
await client.connect();
try {
  for (const table of ['User', 'Order', 'Subscription', 'License']) {
    const result = await client.query<{ exists: string | null }>(
      `SELECT to_regclass($1)::text AS "exists"`,
      [`public."${table}"`],
    );
    if (result.rows[0]?.exists !== null) {
      throw new Error(`Accounts organization detail certification must not depend on ${table}.`);
    }
  }

  await client.query(
    `INSERT INTO "CustomerAccount"
       ("id", "type", "displayName", "ownerId", "billingEmail", "taxId", "lifecycleState")
     VALUES
       ('detail-org', 'ORGANIZATION', 'Detail Org', 'detail-owner', 'billing@detail.test', 'TAX-DETAIL', 'ACTIVE'),
       ('detail-individual', 'INDIVIDUAL', 'Detail Individual', 'detail-owner', 'individual@detail.test', NULL, 'ACTIVE')`,
  );
  await client.query(
    `INSERT INTO "OrganizationProfile" ("accountId", "legalName", "registrationNumber")
     VALUES ('detail-org', 'Detail Organization Legal', 'REG-DETAIL')`,
  );
  await client.query(
    `INSERT INTO "Membership" ("accountId", "userId", "role", "createdAt")
     VALUES
       ('detail-org', 'detail-billing', 'BILLING', '2026-01-01T00:00:00.000Z'),
       ('detail-org', 'detail-license', 'LICENSE_MANAGER', '2026-01-02T00:00:00.000Z'),
       ('detail-org', 'detail-member', 'MEMBER', '2026-01-03T00:00:00.000Z'),
       ('detail-org', 'detail-owner', 'OWNER', '2026-01-04T00:00:00.000Z')`,
  );
  await client.query(
    `INSERT INTO "Invitation"
       ("id", "accountId", "email", "role", "tokenHash", "status", "expiresAt", "createdAt")
     VALUES
       ('detail-invite-old', 'detail-org', 'old@detail.test', 'MEMBER', 'detail-hash-old', 'PENDING', '2027-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z'),
       ('detail-invite-new', 'detail-org', 'new@detail.test', 'LICENSE_MANAGER', 'detail-hash-new', 'PENDING', '2027-01-02T00:00:00.000Z', '2026-03-01T00:00:00.000Z'),
       ('detail-invite-accepted', 'detail-org', 'accepted@detail.test', 'MEMBER', 'detail-hash-accepted', 'ACCEPTED', '2027-01-03T00:00:00.000Z', '2026-04-01T00:00:00.000Z')`,
  );

  const capability = createAccountsOrganizationDetailCapability(
    createAccountsAccountAccessCapability(
      createPostgresAccountsAccountAccessRepository(connectionString),
    ),
    createPostgresAccountsOrganizationDetailRepository(connectionString),
  );

  const owner = await capability.get({ principalId: 'detail-owner', accountId: 'detail-org' });
  if (owner.status !== 'FOUND') {
    throw new Error(`Expected OWNER organization detail, received ${JSON.stringify(owner)}`);
  }
  if (
    owner.detail.organization.legalName !== 'Detail Organization Legal' ||
    owner.detail.organization.registrationNumber !== 'REG-DETAIL' ||
    owner.detail.effectiveRole !== 'OWNER' ||
    !owner.detail.permissions.canManageMembers ||
    !owner.detail.permissions.canViewBilling ||
    !owner.detail.permissions.canViewLicenses ||
    owner.detail.billingEmail !== 'billing@detail.test' ||
    owner.detail.taxId !== 'TAX-DETAIL'
  ) {
    throw new Error(`OWNER detail disclosure is incorrect: ${JSON.stringify(owner.detail)}`);
  }
  if (
    owner.detail.memberships.map((membership) => membership.principalId).join(',') !==
      'detail-billing,detail-license,detail-member,detail-owner'
  ) {
    throw new Error(`Membership ordering/content diverged from V1: ${JSON.stringify(owner.detail.memberships)}`);
  }
  if (
    owner.detail.pendingInvitations.map((invitation) => invitation.id).join(',') !==
      'detail-invite-new,detail-invite-old'
  ) {
    throw new Error(`Pending invitation filtering/ordering is incorrect: ${JSON.stringify(owner.detail.pendingInvitations)}`);
  }
  if (owner.detail.pendingInvitations.some((invitation) => invitation.status !== 'PENDING')) {
    throw new Error('Organization detail exposed a non-PENDING invitation.');
  }

  const billing = await capability.get({ principalId: 'detail-billing', accountId: 'detail-org' });
  if (billing.status !== 'FOUND') {
    throw new Error(`Expected BILLING organization detail, received ${JSON.stringify(billing)}`);
  }
  if (
    billing.detail.effectiveRole !== 'BILLING' ||
    billing.detail.permissions.canManageMembers ||
    !billing.detail.permissions.canViewBilling ||
    billing.detail.permissions.canViewLicenses ||
    billing.detail.billingEmail !== 'billing@detail.test' ||
    billing.detail.taxId !== 'TAX-DETAIL' ||
    billing.detail.memberships.length !== 0 ||
    billing.detail.pendingInvitations.length !== 0
  ) {
    throw new Error(`BILLING detail disclosure is incorrect: ${JSON.stringify(billing.detail)}`);
  }

  const licenseManager = await capability.get({ principalId: 'detail-license', accountId: 'detail-org' });
  if (licenseManager.status !== 'FOUND') {
    throw new Error(`Expected LICENSE_MANAGER organization detail, received ${JSON.stringify(licenseManager)}`);
  }
  if (
    licenseManager.detail.effectiveRole !== 'LICENSE_MANAGER' ||
    licenseManager.detail.permissions.canManageMembers ||
    licenseManager.detail.permissions.canViewBilling ||
    !licenseManager.detail.permissions.canViewLicenses ||
    licenseManager.detail.billingEmail !== null ||
    licenseManager.detail.taxId !== null ||
    licenseManager.detail.memberships.length !== 0 ||
    licenseManager.detail.pendingInvitations.length !== 0
  ) {
    throw new Error(`LICENSE_MANAGER detail disclosure is incorrect: ${JSON.stringify(licenseManager.detail)}`);
  }

  const member = await capability.get({ principalId: 'detail-member', accountId: 'detail-org' });
  if (member.status !== 'FOUND') {
    throw new Error(`Expected MEMBER organization detail, received ${JSON.stringify(member)}`);
  }
  if (
    member.detail.effectiveRole !== 'MEMBER' ||
    member.detail.permissions.canManageMembers ||
    member.detail.permissions.canViewBilling ||
    member.detail.permissions.canViewLicenses ||
    member.detail.billingEmail !== null ||
    member.detail.taxId !== null ||
    member.detail.memberships.length !== 0 ||
    member.detail.pendingInvitations.length !== 0
  ) {
    throw new Error(`MEMBER detail disclosure is incorrect: ${JSON.stringify(member.detail)}`);
  }

  const individual = await capability.get({
    principalId: 'detail-owner',
    accountId: 'detail-individual',
  });
  if (individual.status !== 'REJECTED' || individual.code !== 'ACCOUNT_NOT_ORGANIZATION') {
    throw new Error(`Expected ACCOUNT_NOT_ORGANIZATION, received ${JSON.stringify(individual)}`);
  }

  const absent = await capability.get({ principalId: 'missing-principal', accountId: 'detail-org' });
  if (absent.status !== 'REJECTED' || absent.code !== 'NOT_FOUND') {
    throw new Error(`Expected NOT_FOUND for principal without account access, received ${JSON.stringify(absent)}`);
  }

  console.log('Accounts organization detail PostgreSQL certification GREEN');
} finally {
  await client.end();
}

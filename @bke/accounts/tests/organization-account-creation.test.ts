import { describe, expect, it, vi } from "vitest";
import { createAccountsOrganizationAccountCreationCapability } from "../logic/organization-account-creation";
import type { AccountsOrganizationAccountCreationRepository } from "../logic/organization-account-creation-repository";

function repository(): AccountsOrganizationAccountCreationRepository {
  return {
    createOrganizationAccount: vi.fn(async (record) => ({
      account: {
        id: record.id,
        type: "ORGANIZATION" as const,
        displayName: record.displayName,
        ownerId: record.ownerPrincipalId,
        billingEmail: record.billingEmail,
        taxId: record.taxId,
        lifecycleState: "ACTIVE" as const,
      },
      organization: {
        accountId: record.id,
        legalName: record.legalName,
        registrationNumber: record.registrationNumber,
      },
      ownerMembership: {
        accountId: record.id,
        userId: record.ownerPrincipalId,
        role: "OWNER" as const,
      },
    })),
  };
}

describe("Accounts organization account creation", () => {
  it("normalizes V1 organization inputs and returns owned aggregate state plus audit intent", async () => {
    const repo = repository();
    const capability = createAccountsOrganizationAccountCreationCapability(repo, {
      issue: () => "organization-1",
    });
    const result = await capability.create({
      ownerPrincipalId: " owner-1 ",
      displayName: "  Example Org  ",
      legalName: "  Example Organization Incorporated  ",
      billingEmail: " BILLING@EXAMPLE.COM ",
      registrationNumber: " REG-001 ",
      taxId: " TAX-001 ",
    });

    expect(result).toEqual({
      status: "CREATED",
      account: {
        id: "organization-1",
        type: "ORGANIZATION",
        displayName: "Example Org",
        ownerId: "owner-1",
        billingEmail: "billing@example.com",
        taxId: "TAX-001",
        lifecycleState: "ACTIVE",
      },
      organization: {
        accountId: "organization-1",
        legalName: "Example Organization Incorporated",
        registrationNumber: "REG-001",
      },
      ownerMembership: {
        accountId: "organization-1",
        userId: "owner-1",
        role: "OWNER",
      },
      auditIntent: {
        action: "ORGANIZATION_CREATED",
        targetType: "CustomerAccount",
        targetId: "organization-1",
      },
    });
  });

  it("preserves empty optional strings while mapping omitted optional values to null", async () => {
    const repo = repository();
    const capability = createAccountsOrganizationAccountCreationCapability(repo, {
      issue: () => "organization-2",
    });
    const result = await capability.create({
      ownerPrincipalId: "owner-1",
      displayName: "Example Org",
      legalName: "Example Legal Name",
      billingEmail: "billing@example.com",
      registrationNumber: "   ",
    });
    expect(result.status).toBe("CREATED");
    expect(repo.createOrganizationAccount).toHaveBeenCalledWith(
      expect.objectContaining({ registrationNumber: "", taxId: null }),
    );
  });

  it("rejects invalid input before id allocation and persistence", async () => {
    const repo = repository();
    const issue = vi.fn(() => "unused");
    const capability = createAccountsOrganizationAccountCreationCapability(repo, { issue });
    await expect(
      capability.create({
        ownerPrincipalId: "",
        displayName: "A",
        legalName: "L",
        billingEmail: "not-email",
      }),
    ).resolves.toEqual({ status: "FAILED", code: "INVALID_INPUT" });
    expect(issue).not.toHaveBeenCalled();
    expect(repo.createOrganizationAccount).not.toHaveBeenCalled();
  });

  it("maps id-provider and persistence failures to stable results", async () => {
    const repo = repository();
    const idFailure = createAccountsOrganizationAccountCreationCapability(repo, {
      issue: () => {
        throw new Error("entropy unavailable");
      },
    });
    await expect(
      idFailure.create({
        ownerPrincipalId: "owner-1",
        displayName: "Example Org",
        legalName: "Example Legal Name",
        billingEmail: "billing@example.com",
      }),
    ).resolves.toEqual({ status: "FAILED", code: "ID_PROVIDER_UNAVAILABLE" });

    const persistenceFailure = createAccountsOrganizationAccountCreationCapability(
      {
        createOrganizationAccount: vi.fn(async () => {
          throw new Error("database unavailable");
        }),
      },
      { issue: () => "organization-3" },
    );
    await expect(
      persistenceFailure.create({
        ownerPrincipalId: "owner-1",
        displayName: "Example Org",
        legalName: "Example Legal Name",
        billingEmail: "billing@example.com",
      }),
    ).resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});

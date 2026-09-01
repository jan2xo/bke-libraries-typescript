import { describe, expect, it, vi } from "vitest";
import type {
  AccountsAccountAccessCapability,
  AccountsAccountAccessResult,
} from "../contracts/account-access.contract";
import type { AccountsAccountSnapshot } from "../contracts/account.contract";
import { createAccountsOwnershipTransferCapability } from "../logic/ownership-transfer";
import type { AccountsOwnershipTransferRepository } from "../logic/ownership-transfer-repository";

const organization = (
  lifecycleState: AccountsAccountSnapshot["lifecycleState"] = "ACTIVE",
): AccountsAccountSnapshot => ({
  id: "org-1",
  type: "ORGANIZATION",
  displayName: "Org One",
  ownerId: "owner-old",
  billingEmail: "billing@example.com",
  taxId: null,
  lifecycleState,
});

const authorized = (
  account: AccountsAccountSnapshot = organization(),
): AccountsAccountAccessResult => ({
  status: "AUTHORIZED",
  account,
  effectiveRole: "OWNER",
});

function createFixture(accessResult: AccountsAccountAccessResult = authorized()) {
  const accountAccess: AccountsAccountAccessCapability = {
    authorize: vi.fn(async () => accessResult),
  };
  const repository: AccountsOwnershipTransferRepository = {
    transfer: vi.fn(async ({ accountId, newOwnerPrincipalId }) => ({
      status: "TRANSFERRED" as const,
      account: {
        ...organization(),
        id: accountId,
        ownerId: newOwnerPrincipalId,
        type: "ORGANIZATION" as const,
      },
      newOwnerMembership: {
        accountId,
        userId: newOwnerPrincipalId,
        role: "OWNER" as const,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      previousOwnerPrincipalId: "owner-old",
      previousNewOwnerRole: "MEMBER" as const,
      previousOwnerMembershipDemoted: true,
    })),
  };
  return {
    accountAccess,
    repository,
    capability: createAccountsOwnershipTransferCapability(accountAccess, repository),
  };
}

describe("Accounts ownership transfer", () => {
  it("transfers ownership and emits both V1 audit intents", async () => {
    const fixture = createFixture();
    const result = await fixture.capability.transfer({
      actorPrincipalId: " owner-old ",
      accountId: " org-1 ",
      newOwnerPrincipalId: " owner-new ",
    });

    expect(result.status).toBe("TRANSFERRED");
    if (result.status !== "TRANSFERRED") return;
    expect(result.account.ownerId).toBe("owner-new");
    expect(result.newOwnerMembership.role).toBe("OWNER");
    expect(result.previousNewOwnerRole).toBe("MEMBER");
    expect(result.auditIntents).toEqual([
      {
        action: "ORGANIZATION_OWNER_DEMOTED",
        accountId: "org-1",
        targetType: "Membership",
        targetId: "owner-old",
        metadata: {
          from: "OWNER",
          to: "BILLING",
          reason: "OWNERSHIP_TRANSFERRED",
        },
      },
      {
        action: "ORGANIZATION_OWNER_TRANSFERRED",
        accountId: "org-1",
        targetType: "CustomerAccount",
        targetId: "org-1",
        metadata: {
          from: "owner-old",
          to: "owner-new",
          previousRole: "MEMBER",
          nextRole: "OWNER",
          previousOwnerDemoted: true,
        },
      },
    ]);
    expect(fixture.accountAccess.authorize).toHaveBeenCalledWith({
      principalId: "owner-old",
      accountId: "org-1",
      requiredCapability: "MANAGE_MEMBERS",
    });
  });

  it("rejects non-organization and immutable lifecycle states before persistence", async () => {
    const individualFixture = createFixture(
      authorized({ ...organization(), type: "INDIVIDUAL" }),
    );
    expect(
      await individualFixture.capability.transfer({
        actorPrincipalId: "owner-old",
        accountId: "org-1",
        newOwnerPrincipalId: "owner-new",
      }),
    ).toEqual({ status: "REJECTED", code: "ACCOUNT_NOT_ORGANIZATION" });
    expect(individualFixture.repository.transfer).not.toHaveBeenCalled();

    for (const [state, code] of [
      ["SUSPENDED", "SUSPENDED_ACCOUNT"],
      ["CLOSURE_REQUESTED", "CLOSED_ACCOUNT"],
      ["CLOSED", "CLOSED_ACCOUNT"],
    ] as const) {
      const fixture = createFixture(authorized(organization(state)));
      expect(
        await fixture.capability.transfer({
          actorPrincipalId: "owner-old",
          accountId: "org-1",
          newOwnerPrincipalId: "owner-new",
        }),
      ).toEqual({ status: "REJECTED", code });
      expect(fixture.repository.transfer).not.toHaveBeenCalled();
    }
  });

  it("propagates access and repository rejection semantics", async () => {
    const forbiddenFixture = createFixture({
      status: "REJECTED",
      code: "ACCOUNT_ROLE_FORBIDDEN",
    });
    expect(
      await forbiddenFixture.capability.transfer({
        actorPrincipalId: "member",
        accountId: "org-1",
        newOwnerPrincipalId: "owner-new",
      }),
    ).toEqual({ status: "REJECTED", code: "ACCOUNT_ROLE_FORBIDDEN" });

    const missingMemberFixture = createFixture();
    missingMemberFixture.repository.transfer = vi.fn(async () => ({
      status: "REJECTED" as const,
      code: "MEMBER_NOT_FOUND" as const,
    }));
    expect(
      await createAccountsOwnershipTransferCapability(
        missingMemberFixture.accountAccess,
        missingMemberFixture.repository,
      ).transfer({
        actorPrincipalId: "owner-old",
        accountId: "org-1",
        newOwnerPrincipalId: "owner-old",
      }),
    ).toEqual({ status: "REJECTED", code: "MEMBER_NOT_FOUND" });
  });

  it("rejects invalid input and maps persistence exceptions", async () => {
    const invalidFixture = createFixture();
    expect(
      await invalidFixture.capability.transfer({
        actorPrincipalId: " ",
        accountId: "org-1",
        newOwnerPrincipalId: "owner-new",
      }),
    ).toEqual({ status: "FAILED", code: "INVALID_INPUT" });
    expect(invalidFixture.accountAccess.authorize).not.toHaveBeenCalled();

    const failedFixture = createFixture();
    failedFixture.repository.transfer = vi.fn(async () => {
      throw new Error("database unavailable");
    });
    expect(
      await createAccountsOwnershipTransferCapability(
        failedFixture.accountAccess,
        failedFixture.repository,
      ).transfer({
        actorPrincipalId: "owner-old",
        accountId: "org-1",
        newOwnerPrincipalId: "owner-new",
      }),
    ).toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});

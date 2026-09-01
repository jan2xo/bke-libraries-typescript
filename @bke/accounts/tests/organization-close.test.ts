import { describe, expect, it, vi } from "vitest";
import type {
  AccountsAccountAccessCapability,
  AccountsAccountAccessResult,
} from "../contracts/account-access.contract";
import type { AccountsAccountSnapshot } from "../contracts/account.contract";
import { createAccountsOrganizationCloseCapability } from "../logic/organization-close";
import type { AccountsOrganizationCloseRepository } from "../logic/organization-close-repository";

const now = new Date("2026-09-01T08:00:00.000Z");

const organization = (
  lifecycleState: AccountsAccountSnapshot["lifecycleState"] = "ACTIVE",
): AccountsAccountSnapshot => ({
  id: "org-close",
  type: "ORGANIZATION",
  displayName: "Close Org",
  ownerId: "owner-close",
  billingEmail: "close@example.com",
  taxId: "TAX-CLOSE",
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
  const repository: AccountsOrganizationCloseRepository = {
    close: vi.fn(async ({ accountId, closedAt }) => ({
      status: "CLOSED" as const,
      account: {
        ...organization("CLOSED"),
        id: accountId,
        type: "ORGANIZATION" as const,
        lifecycleState: "CLOSED" as const,
        closureRequestedAt: closedAt,
        closedAt,
      },
    })),
  };
  const clock = { now: vi.fn(() => now) };
  return {
    accountAccess,
    repository,
    clock,
    capability: createAccountsOrganizationCloseCapability(accountAccess, repository, clock),
  };
}

describe("Accounts organization close", () => {
  it("closes an organization with CLOSE_ACCOUNT and emits host-owned audit intent", async () => {
    const fixture = createFixture();
    const result = await fixture.capability.close({
      actorPrincipalId: " owner-close ",
      accountId: " org-close ",
    });

    expect(result.status).toBe("CLOSED");
    if (result.status !== "CLOSED") return;
    expect(result.account.lifecycleState).toBe("CLOSED");
    expect(result.account.closureRequestedAt).toEqual(now);
    expect(result.account.closedAt).toEqual(now);
    expect(result.auditIntent).toEqual({
      action: "ORGANIZATION_CLOSED",
      accountId: "org-close",
      targetType: "CustomerAccount",
      targetId: "org-close",
    });
    expect(fixture.accountAccess.authorize).toHaveBeenCalledWith({
      principalId: "owner-close",
      accountId: "org-close",
      requiredCapability: "CLOSE_ACCOUNT",
    });
    expect(fixture.repository.close).toHaveBeenCalledWith({
      accountId: "org-close",
      closedAt: now,
    });
  });

  it("preserves V1 lifecycle behavior by allowing suspended and already-closed organizations to reach persistence", async () => {
    for (const state of ["SUSPENDED", "CLOSED"] as const) {
      const fixture = createFixture(authorized(organization(state)));
      const result = await fixture.capability.close({
        actorPrincipalId: "owner-close",
        accountId: "org-close",
      });
      expect(result.status).toBe("CLOSED");
      expect(fixture.repository.close).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects non-organization accounts before persistence", async () => {
    const fixture = createFixture(
      authorized({ ...organization(), type: "INDIVIDUAL" }),
    );
    expect(
      await fixture.capability.close({
        actorPrincipalId: "owner-close",
        accountId: "org-close",
      }),
    ).toEqual({ status: "REJECTED", code: "ACCOUNT_NOT_ORGANIZATION" });
    expect(fixture.repository.close).not.toHaveBeenCalled();
  });

  it("propagates account-access rejection and failure semantics", async () => {
    for (const accessResult of [
      { status: "REJECTED", code: "NOT_FOUND" },
      { status: "REJECTED", code: "ACCOUNT_ROLE_FORBIDDEN" },
      { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" },
    ] as const satisfies readonly AccountsAccountAccessResult[]) {
      const fixture = createFixture(accessResult);
      const result = await fixture.capability.close({
        actorPrincipalId: "owner-close",
        accountId: "org-close",
      });
      expect(result).toEqual(accessResult);
      expect(fixture.repository.close).not.toHaveBeenCalled();
    }
  });

  it("rejects invalid input and maps persistence exceptions", async () => {
    const invalid = createFixture();
    expect(
      await invalid.capability.close({ actorPrincipalId: " ", accountId: "org-close" }),
    ).toEqual({ status: "FAILED", code: "INVALID_INPUT" });
    expect(invalid.accountAccess.authorize).not.toHaveBeenCalled();

    const failed = createFixture();
    failed.repository.close = vi.fn(async () => {
      throw new Error("database unavailable");
    });
    expect(
      await createAccountsOrganizationCloseCapability(
        failed.accountAccess,
        failed.repository,
        failed.clock,
      ).close({ actorPrincipalId: "owner-close", accountId: "org-close" }),
    ).toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});

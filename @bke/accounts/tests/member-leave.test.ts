import { describe, expect, it, vi } from "vitest";
import type {
  AccountsAccountAccessCapability,
  AccountsAccountAccessResult,
} from "../contracts/account-access.contract";
import type { AccountsAccountSnapshot } from "../contracts/account.contract";
import { createAccountsMemberLeaveCapability } from "../logic/member-leave";
import type { AccountsMemberLeaveRepository } from "../logic/member-leave-repository";

const organization = (
  lifecycleState: AccountsAccountSnapshot["lifecycleState"] = "ACTIVE",
): AccountsAccountSnapshot => ({
  id: "org-1",
  type: "ORGANIZATION",
  displayName: "Org One",
  ownerId: "owner-1",
  billingEmail: "billing@example.com",
  taxId: null,
  lifecycleState,
});

const authorized = (
  effectiveRole: "BILLING" | "LICENSE_MANAGER" | "MEMBER" | "OWNER" = "MEMBER",
  account: AccountsAccountSnapshot = organization(),
): AccountsAccountAccessResult => ({ status: "AUTHORIZED", account, effectiveRole });

function createFixture(accessResult: AccountsAccountAccessResult = authorized()) {
  const accountAccess: AccountsAccountAccessCapability = {
    authorize: vi.fn(async () => accessResult),
  };
  const repository: AccountsMemberLeaveRepository = {
    leave: vi.fn(async ({ accountId, principalId }) => ({
      status: "LEFT" as const,
      membership: {
        accountId,
        userId: principalId,
        role: "MEMBER" as const,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    })),
  };
  return {
    accountAccess,
    repository,
    capability: createAccountsMemberLeaveCapability(accountAccess, repository),
  };
}

describe("Accounts member leave", () => {
  it("lets a non-owner leave and returns host-owned audit intent", async () => {
    const fixture = createFixture();
    const result = await fixture.capability.leave({ principalId: " member-1 ", accountId: " org-1 " });

    expect(result.status).toBe("LEFT");
    if (result.status !== "LEFT") return;
    expect(result.membership.userId).toBe("member-1");
    expect(result.auditIntent).toEqual({
      action: "ORGANIZATION_MEMBER_LEFT",
      accountId: "org-1",
      targetType: "Membership",
      targetId: "member-1",
    });
    expect(fixture.repository.leave).toHaveBeenCalledWith({
      accountId: "org-1",
      principalId: "member-1",
    });
  });

  it("preserves V1 behavior allowing non-owners to leave suspended or closed organizations", async () => {
    for (const lifecycleState of ["SUSPENDED", "CLOSURE_REQUESTED", "CLOSED"] as const) {
      const fixture = createFixture(authorized("MEMBER", organization(lifecycleState)));
      const result = await fixture.capability.leave({ principalId: "member-1", accountId: "org-1" });
      expect(result.status).toBe("LEFT");
    }
  });

  it("rejects the effective OWNER before persistence", async () => {
    const fixture = createFixture(authorized("OWNER"));
    const result = await fixture.capability.leave({ principalId: "owner-1", accountId: "org-1" });
    expect(result).toEqual({ status: "REJECTED", code: "OWNER_CANNOT_LEAVE" });
    expect(fixture.repository.leave).not.toHaveBeenCalled();
  });

  it("rejects non-organization accounts", async () => {
    const fixture = createFixture(
      authorized("MEMBER", {
        ...organization(),
        id: "individual-1",
        type: "INDIVIDUAL",
      }),
    );
    const result = await fixture.capability.leave({
      principalId: "member-1",
      accountId: "individual-1",
    });
    expect(result).toEqual({ status: "REJECTED", code: "ACCOUNT_NOT_ORGANIZATION" });
    expect(fixture.repository.leave).not.toHaveBeenCalled();
  });

  it("propagates account access rejection without touching persistence", async () => {
    const fixture = createFixture({ status: "REJECTED", code: "NOT_FOUND" });
    const result = await fixture.capability.leave({ principalId: "member-1", accountId: "missing" });
    expect(result).toEqual({ status: "REJECTED", code: "NOT_FOUND" });
    expect(fixture.repository.leave).not.toHaveBeenCalled();
  });

  it("propagates repository ownership and missing-member rechecks", async () => {
    const ownerFixture = createFixture();
    ownerFixture.repository.leave = vi.fn(async () => ({
      status: "REJECTED" as const,
      code: "OWNER_CANNOT_LEAVE" as const,
    }));
    const ownerResult = await createAccountsMemberLeaveCapability(
      ownerFixture.accountAccess,
      ownerFixture.repository,
    ).leave({ principalId: "member-1", accountId: "org-1" });
    expect(ownerResult).toEqual({ status: "REJECTED", code: "OWNER_CANNOT_LEAVE" });

    const missingFixture = createFixture();
    missingFixture.repository.leave = vi.fn(async () => ({
      status: "REJECTED" as const,
      code: "MEMBER_NOT_FOUND" as const,
    }));
    const missingResult = await createAccountsMemberLeaveCapability(
      missingFixture.accountAccess,
      missingFixture.repository,
    ).leave({ principalId: "member-1", accountId: "org-1" });
    expect(missingResult).toEqual({ status: "REJECTED", code: "MEMBER_NOT_FOUND" });
  });

  it("rejects invalid input and maps persistence exceptions", async () => {
    const invalidFixture = createFixture();
    expect(
      await invalidFixture.capability.leave({ principalId: " ", accountId: "org-1" }),
    ).toEqual({ status: "FAILED", code: "INVALID_INPUT" });
    expect(invalidFixture.accountAccess.authorize).not.toHaveBeenCalled();

    const failedFixture = createFixture();
    failedFixture.repository.leave = vi.fn(async () => {
      throw new Error("database unavailable");
    });
    const failedResult = await createAccountsMemberLeaveCapability(
      failedFixture.accountAccess,
      failedFixture.repository,
    ).leave({ principalId: "member-1", accountId: "org-1" });
    expect(failedResult).toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});

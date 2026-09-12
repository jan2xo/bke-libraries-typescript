import { describe, expect, it, vi } from "vitest";
import { createAccountsPrivacyRequestManagementCapability } from "../logic/privacy-request-management";
import type { AccountsPrivacyRequestSnapshot } from "../contracts/privacy-request-management.contract";

const base: AccountsPrivacyRequestSnapshot = {
  id: "pr-1",
  userId: "user-1",
  customerAccountId: "acct-1",
  requestType: "ACCESS",
  status: "OPEN",
  summary: "Need my data",
  responseSummary: null,
  reviewedById: null,
  reviewedAt: null,
  closedAt: null,
  ipAddress: "127.0.0.1",
  userAgent: "vitest",
};

describe("Accounts privacy request management", () => {
  it("creates an OPEN request with bounded public metadata", async () => {
    const create = vi.fn(async (input) => ({ ...base, ...input, id: "pr-2", status: "OPEN" as const, responseSummary: null, reviewedById: null, reviewedAt: null, closedAt: null }));
    const capability = createAccountsPrivacyRequestManagementCapability({
      create,
      findById: async () => null,
      transition: async () => base,
    });

    const result = await capability.create({
      userId: " user-1 ",
      customerAccountId: " acct-1 ",
      requestType: "ACCESS",
      summary: "x".repeat(2_100),
      ipAddress: "1".repeat(200),
      userAgent: "u".repeat(600),
    });

    expect(result.status).toBe("OK");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      customerAccountId: "acct-1",
      summary: "x".repeat(2_000),
      ipAddress: "1".repeat(128),
      userAgent: "u".repeat(500),
    }));
  });

  it("rejects fulfilled transitions without a substantive response", async () => {
    const transition = vi.fn(async () => base);
    const capability = createAccountsPrivacyRequestManagementCapability({
      create: async () => base,
      findById: async () => base,
      transition,
    });

    const result = await capability.transition({
      actorId: "admin-1",
      requestId: "pr-1",
      status: "FULFILLED",
      responseSummary: "too short",
    });

    expect(result).toEqual({ status: "FAILED", code: "PRIVACY_RESPONSE_REQUIRED" });
    expect(transition).not.toHaveBeenCalled();
  });

  it("rejects transitions from terminal requests", async () => {
    const capability = createAccountsPrivacyRequestManagementCapability({
      create: async () => base,
      findById: async () => ({ ...base, status: "REJECTED" }),
      transition: async () => base,
    });

    expect(await capability.transition({
      actorId: "admin-1",
      requestId: "pr-1",
      status: "IN_REVIEW",
      responseSummary: "reviewing",
    })).toEqual({ status: "FAILED", code: "PRIVACY_REQUEST_CLOSED" });
  });

  it("marks terminal transitions closed and non-terminal review open", async () => {
    const transition = vi.fn(async (input) => ({
      ...base,
      status: input.toStatus,
      responseSummary: input.responseSummary,
      reviewedById: input.actorId,
      reviewedAt: input.reviewedAt,
      closedAt: input.closedAt,
    }));
    const capability = createAccountsPrivacyRequestManagementCapability({
      create: async () => base,
      findById: async () => base,
      transition,
    });

    const review = await capability.transition({ actorId: "admin-1", requestId: "pr-1", status: "IN_REVIEW", responseSummary: "reviewing" });
    expect(review.status).toBe("OK");
    expect(transition.mock.calls[0]?.[0].closedAt).toBeNull();

    const fulfilled = await capability.transition({ actorId: "admin-1", requestId: "pr-1", status: "FULFILLED", responseSummary: "Request fulfilled completely" });
    expect(fulfilled.status).toBe("OK");
    expect(transition.mock.calls[1]?.[0].closedAt).toBeInstanceOf(Date);
  });
});

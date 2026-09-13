import { describe, expect, it } from "vitest";
import { privacyModuleManifest } from "../module.manifest";
import { PRIVACY_REQUEST_POLICY_CAPABILITY_ID } from "../contracts/privacy-request-policy.contract";
import {
  normalizePrivacyRequestNetworkSnapshot,
  normalizePrivacyRequestType,
  planPrivacyRequestCreation,
  planPrivacyRequestTransition,
} from "../logic/privacy-request-policy";

describe("privacy request policy", () => {
  it("advertises a host-independent request policy capability", () => {
    expect(privacyModuleManifest).toEqual({
      moduleId: "privacy",
      needs: [],
      provides: [PRIVACY_REQUEST_POLICY_CAPABILITY_ID],
    });
  });

  it("accepts only canonical privacy request types", () => {
    expect(normalizePrivacyRequestType("DELETION")).toBe("DELETION");
    expect(() => normalizePrivacyRequestType("DELETE")).toThrow("INVALID_PRIVACY_REQUEST_TYPE");
  });

  it("caps network evidence without owning HTTP extraction", () => {
    expect(normalizePrivacyRequestNetworkSnapshot({ ipAddress: "x".repeat(200), userAgent: "y".repeat(700) })).toEqual({
      ipAddress: "x".repeat(128),
      userAgent: "y".repeat(500),
    });
  });

  it("plans OPEN request creation with event and audit intent", () => {
    const plan = planPrivacyRequestCreation({
      userId: "user-1",
      accountId: "account-1",
      requestType: "ACCESS",
      summary: "s".repeat(2_100),
      network: { ipAddress: "127.0.0.1", userAgent: "agent" },
    });
    expect(plan.request.status).toBe("OPEN");
    expect(plan.request.summary).toHaveLength(2_000);
    expect(plan.event).toMatchObject({ eventType: "CREATED", toStatus: "OPEN", actorId: "user-1" });
    expect(plan.audit).toMatchObject({ action: "PRIVACY_REQUEST_CREATED", accountId: "account-1" });
  });

  it("rejects transitions from terminal states", () => {
    expect(() => planPrivacyRequestTransition({ actorId: "admin", currentStatus: "FULFILLED", targetStatus: "IN_REVIEW", responseSummary: "review" }))
      .toThrow("PRIVACY_REQUEST_CLOSED");
  });

  it("requires a meaningful response when fulfilling a request", () => {
    expect(() => planPrivacyRequestTransition({ actorId: "admin", currentStatus: "IN_REVIEW", targetStatus: "FULFILLED", responseSummary: "short" }))
      .toThrow("PRIVACY_RESPONSE_REQUIRED");
  });

  it("keeps IN_REVIEW open and terminal outcomes closed", () => {
    const review = planPrivacyRequestTransition({ actorId: "admin", currentStatus: "OPEN", targetStatus: "IN_REVIEW", responseSummary: "review started" });
    const fulfilled = planPrivacyRequestTransition({ actorId: "admin", accountId: "account-1", currentStatus: "IN_REVIEW", targetStatus: "FULFILLED", responseSummary: "Request completed successfully." });
    expect(review.update.shouldClose).toBe(false);
    expect(fulfilled.update.shouldClose).toBe(true);
    expect(fulfilled.event.metadata.responseSummaryLength).toBe(31);
    expect(fulfilled.audit.metadata).toEqual({ from: "IN_REVIEW", to: "FULFILLED" });
  });
});

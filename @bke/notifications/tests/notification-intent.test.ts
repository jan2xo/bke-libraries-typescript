import { describe, expect, it } from "vitest";
import { createNotificationsIntentCapability } from "../logic/notification-intent";

describe("Notifications intent capability", () => {
  const now = () => new Date("2026-09-03T02:00:00.000Z");

  it("creates an individual 50%-off login notification intent", () => {
    const capability = createNotificationsIntentCapability(now);
    const result = capability.create({
      source: { moduleId: "commerce", event: "offer.eligible", sourceReference: "offer-50" },
      audience: { kind: "PRINCIPAL", principalId: "principal-123" },
      content: {
        title: "50% OFF",
        body: "Your account is eligible for 50% off.",
        category: "PROMOTION",
      },
      context: { trigger: "LOGIN", placementHint: "LOGIN" },
      idempotencyKey: "promo-50-login-principal-123",
    });

    expect(result.status).toBe("NOTIFY");
    if (result.status !== "NOTIFY") throw new Error("expected NOTIFY");
    expect(result.value.audience).toEqual({ kind: "PRINCIPAL", principalId: "principal-123" });
    expect(result.value.context.trigger).toBe("LOGIN");
  });

  it("supports a first anonymous visitor without binding to UI", () => {
    const capability = createNotificationsIntentCapability(now);
    const result = capability.create({
      source: { moduleId: "presentation", event: "visitor.first-entry" },
      audience: { kind: "VISITOR", visitorId: "visitor-1" },
      content: { title: "Welcome", body: "Welcome to BKE.", category: "PROMOTION" },
      context: { trigger: "FIRST_VISIT", placementHint: "SITE_ENTRY" },
      idempotencyKey: "welcome-first-visitor-1",
    });

    expect(result.status).toBe("NOTIFY");
    if (result.status !== "NOTIFY") throw new Error("expected NOTIFY");
    expect(result.value.audience.kind).toBe("VISITOR");
  });

  it("treats notify-all as a first-class audience selector", () => {
    const capability = createNotificationsIntentCapability(now);
    const result = capability.create({
      source: { moduleId: "operations", event: "broadcast.created", sourceReference: "broadcast-1" },
      audience: { kind: "ALL_USERS" },
      content: { title: "50% OFF THIS WEEK", body: "Promotion is now live.", category: "PROMOTION" },
      context: { trigger: "ADMIN_BROADCAST" },
      priority: "HIGH",
      idempotencyKey: "broadcast-1-all-users",
    });

    expect(result.status).toBe("NOTIFY");
    if (result.status !== "NOTIFY") throw new Error("expected NOTIFY");
    expect(result.value.audience).toEqual({ kind: "ALL_USERS" });
    expect(result.value.priority).toBe("HIGH");
  });

  it("supports all-active-clients separately from all users", () => {
    const capability = createNotificationsIntentCapability(now);
    const result = capability.create({
      source: { moduleId: "licensing", event: "maintenance.notice" },
      audience: { kind: "ALL_ACTIVE_CLIENTS" },
      content: { title: "Maintenance", body: "A maintenance window is scheduled.", category: "SYSTEM" },
      idempotencyKey: "maintenance-active-clients-1",
    });

    expect(result.status).toBe("NOTIFY");
    if (result.status !== "NOTIFY") throw new Error("expected NOTIFY");
    expect(result.value.audience.kind).toBe("ALL_ACTIVE_CLIENTS");
  });

  it("suppresses ineligible and expired intents", () => {
    const capability = createNotificationsIntentCapability(now);
    expect(capability.create({
      source: { moduleId: "commerce", event: "offer.checked" },
      audience: { kind: "ACCOUNT", accountId: "account-1" },
      content: { title: "Offer", body: "Offer available.", category: "PROMOTION" },
      idempotencyKey: "offer-account-1",
      eligible: false,
    })).toEqual({ status: "DO_NOT_NOTIFY", code: "INELIGIBLE" });

    expect(capability.create({
      source: { moduleId: "commerce", event: "offer.eligible" },
      audience: { kind: "SEGMENT", segmentKey: "returning-customers" },
      content: { title: "Expired", body: "Expired promotion.", category: "PROMOTION" },
      idempotencyKey: "expired-promo",
      expiresAt: new Date("2026-09-03T01:59:59.000Z"),
    })).toEqual({ status: "DO_NOT_NOTIFY", code: "EXPIRED" });
  });

  it("rejects empty targeting identifiers", () => {
    const capability = createNotificationsIntentCapability(now);
    expect(capability.create({
      source: { moduleId: "commerce", event: "offer.eligible" },
      audience: { kind: "ACCOUNT", accountId: "   " },
      content: { title: "Offer", body: "Offer available.", category: "PROMOTION" },
      idempotencyKey: "bad-account",
    })).toEqual({ status: "FAILED", code: "INVALID_INPUT" });
  });
});

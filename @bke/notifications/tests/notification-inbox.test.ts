import { describe, expect, it } from "vitest";
import { createNotificationsInboxPolicyCapability } from "../logic/notification-inbox";
import { createNotificationsIntentCapability } from "../logic/notification-intent";

const now = new Date("2026-09-20T15:00:00.000Z");

function intent(audience:
  | { kind: "PRINCIPAL"; principalId: string }
  | { kind: "ACCOUNT"; accountId: string }
  | { kind: "ADMINISTRATORS" }
  | { kind: "ALL_USERS" }
) {
  const result = createNotificationsIntentCapability(() => now).create({
    source: {
      moduleId: "commerce",
      event: "PAYMENT_RECEIVED",
      sourceReference: "payment-1",
    },
    audience,
    content: {
      title: "Payment received",
      body: "Payment was confirmed.",
      category: "TRANSACTIONAL",
    },
    idempotencyKey: "payment-received:payment-1",
  });
  if (result.status !== "NOTIFY") throw new Error("expected notification intent");
  return result.value;
}

describe("Notifications inbox policy", () => {
  const capability = createNotificationsInboxPolicyCapability(() => now);

  it("materializes an immutable durable snapshot", () => {
    const result = capability.materialize({
      notificationId: "notification-1",
      intent: intent({ kind: "ACCOUNT", accountId: "account-1" }),
      createdAt: new Date("2026-09-20T14:55:00.000Z"),
    });
    expect(result.status).toBe("MATERIALIZED");
    if (result.status !== "MATERIALIZED") throw new Error("expected materialized");
    expect(result.value.notificationId).toBe("notification-1");
    expect(result.value.audience).toEqual({ kind: "ACCOUNT", accountId: "account-1" });
    expect(Object.isFrozen(result.value)).toBe(true);
  });

  it("matches account-bound notifications only to account members", () => {
    const result = capability.materialize({
      notificationId: "notification-account",
      intent: intent({ kind: "ACCOUNT", accountId: "account-1" }),
      createdAt: now,
    });
    if (result.status !== "MATERIALIZED") throw new Error("expected materialized");

    expect(capability.visibility({
      notification: result.value,
      principal: {
        principalId: "user-1",
        role: "CUSTOMER",
        accountIds: ["account-1"],
      },
    })).toEqual({ status: "VISIBLE" });

    expect(capability.visibility({
      notification: result.value,
      principal: {
        principalId: "user-2",
        role: "CUSTOMER",
        accountIds: ["account-2"],
      },
    })).toEqual({ status: "HIDDEN", code: "AUDIENCE_MISMATCH" });
  });

  it("treats administrator notifications as first-class audience", () => {
    const result = capability.materialize({
      notificationId: "notification-admin",
      intent: intent({ kind: "ADMINISTRATORS" }),
      createdAt: now,
    });
    if (result.status !== "MATERIALIZED") throw new Error("expected materialized");

    expect(capability.visibility({
      notification: result.value,
      principal: {
        principalId: "admin-1",
        role: "ADMIN",
        accountIds: [],
      },
    })).toEqual({ status: "VISIBLE" });

    expect(capability.visibility({
      notification: result.value,
      principal: {
        principalId: "customer-1",
        role: "CUSTOMER",
        accountIds: [],
      },
    })).toEqual({ status: "HIDDEN", code: "AUDIENCE_MISMATCH" });
  });

  it("supports direct principal and all-user visibility", () => {
    const direct = capability.materialize({
      notificationId: "direct",
      intent: intent({ kind: "PRINCIPAL", principalId: "user-1" }),
      createdAt: now,
    });
    const global = capability.materialize({
      notificationId: "global",
      intent: intent({ kind: "ALL_USERS" }),
      createdAt: now,
    });
    if (direct.status !== "MATERIALIZED" || global.status !== "MATERIALIZED") {
      throw new Error("expected materialized");
    }

    const principal = {
      principalId: "user-1",
      role: "CUSTOMER",
      accountIds: [] as string[],
    };
    expect(capability.visibility({ notification: direct.value, principal }).status).toBe("VISIBLE");
    expect(capability.visibility({ notification: global.value, principal }).status).toBe("VISIBLE");
  });

  it("hides dismissed and expired notifications", () => {
    const expiredIntent = createNotificationsIntentCapability(
      () => new Date("2026-09-20T14:00:00.000Z"),
    ).create({
      source: { moduleId: "trials", event: "TRIAL_ENDING" },
      audience: { kind: "ACCOUNT", accountId: "account-1" },
      content: {
        title: "Trial ending",
        body: "Trial is ending.",
        category: "LICENSE",
      },
      idempotencyKey: "trial-ending-1",
      expiresAt: new Date("2026-09-20T14:30:00.000Z"),
    });
    if (expiredIntent.status !== "NOTIFY") throw new Error("expected intent");
    const materialized = capability.materialize({
      notificationId: "expired",
      intent: expiredIntent.value,
      createdAt: new Date("2026-09-20T14:00:00.000Z"),
    });
    if (materialized.status !== "MATERIALIZED") throw new Error("expected materialized");
    const principal = {
      principalId: "user-1",
      role: "CUSTOMER",
      accountIds: ["account-1"],
    };
    expect(capability.visibility({
      notification: materialized.value,
      principal,
      now,
    })).toEqual({ status: "HIDDEN", code: "EXPIRED" });
    expect(capability.visibility({
      notification: { ...materialized.value, expiresAt: null },
      principal,
      receiptState: "DISMISSED",
      now,
    })).toEqual({ status: "HIDDEN", code: "DISMISSED" });
  });

  it("owns idempotent read and dismiss receipt transitions", () => {
    expect(capability.transitionReceipt({
      state: "UNREAD",
      action: "MARK_READ",
    })).toEqual({ status: "TRANSITIONED", state: "READ" });
    expect(capability.transitionReceipt({
      state: "READ",
      action: "MARK_READ",
    })).toEqual({ status: "UNCHANGED", state: "READ" });
    expect(capability.transitionReceipt({
      state: "READ",
      action: "DISMISS",
    })).toEqual({ status: "TRANSITIONED", state: "DISMISSED" });
    expect(capability.transitionReceipt({
      state: "DISMISSED",
      action: "DISMISS",
    })).toEqual({ status: "UNCHANGED", state: "DISMISSED" });
  });
});

import { describe, expect, it } from "vitest";
import type {
  EntitlementsTransitionDurableRightInput,
} from "../contracts/durable-right-lifecycle.contract";
import { createEntitlementsDurableRightLifecycleCapability } from "../logic/durable-right-lifecycle";
import type {
  EntitlementsDurableRightLifecycleRepository,
} from "../logic/durable-right-lifecycle-repository";

const now = new Date("2026-09-23T00:00:00.000Z");

function input(
  targetStatus: "ACTIVE" | "SUSPENDED" | "REVOKED",
): EntitlementsTransitionDurableRightInput {
  return {
    entitlementId: " entitlement-1 ",
    targetStatus,
    reason: " PAYMENT_REFUNDED ",
    changedAt: now,
  };
}

describe("Entitlements durable-right lifecycle", () => {
  it("owns transition policy while delegating an atomic persistence fact", async () => {
    let received: Parameters<EntitlementsDurableRightLifecycleRepository["transition"]>[0] | undefined;
    const repository: EntitlementsDurableRightLifecycleRepository = {
      async transition(value) {
        received = value;
        return {
          status: "UPDATED",
          value: {
            entitlementId: value.entitlementId,
            subjectId: "account-1",
            resourceId: "product-1",
            sourceReference: "commerce:order:item",
            status: value.targetStatus,
            quantity: 1,
            scopeSnapshot: {},
            grantSnapshot: {},
            validFrom: new Date("2026-09-01T00:00:00.000Z"),
            validUntil: null,
            statusChangedAt: value.changedAt,
            statusReason: value.reason,
            createdAt: new Date("2026-09-01T00:00:00.000Z"),
          },
        };
      },
    };

    const capability = createEntitlementsDurableRightLifecycleCapability(repository);
    expect((await capability.transition(input("SUSPENDED"))).status).toBe("UPDATED");
    expect(received?.entitlementId).toBe("entitlement-1");
    expect(received?.reason).toBe("PAYMENT_REFUNDED");
    expect(received?.allowedFromStatuses).toEqual(["ACTIVE"]);

    await capability.transition(input("ACTIVE"));
    expect(received?.allowedFromStatuses).toEqual(["SUSPENDED"]);

    await capability.transition(input("REVOKED"));
    expect(received?.allowedFromStatuses).toEqual(["ACTIVE", "SUSPENDED"]);
  });

  it("rejects malformed lifecycle facts before persistence", async () => {
    let calls = 0;
    const repository: EntitlementsDurableRightLifecycleRepository = {
      async transition() {
        calls += 1;
        throw new Error("should not be reached");
      },
    };
    const capability = createEntitlementsDurableRightLifecycleCapability(repository);

    expect(await capability.transition({ ...input("REVOKED"), entitlementId: " " }))
      .toEqual({ status: "FAILED", code: "INVALID_INPUT" });
    expect(await capability.transition({ ...input("REVOKED"), reason: " " }))
      .toEqual({ status: "FAILED", code: "INVALID_INPUT" });
    expect(await capability.transition({ ...input("REVOKED"), changedAt: new Date("invalid") }))
      .toEqual({ status: "FAILED", code: "INVALID_INPUT" });
    expect(calls).toBe(0);
  });

  it("fails closed when persistence is unavailable", async () => {
    const capability = createEntitlementsDurableRightLifecycleCapability({
      async transition() {
        throw new Error("database unavailable");
      },
    });
    expect(await capability.transition(input("REVOKED")))
      .toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});

import { describe, expect, it } from "vitest";
import type { EntitlementsGrantDurableRightInput } from "../contracts/durable-right-grant.contract";
import { createEntitlementsDurableRightGrantCapability } from "../logic/durable-right-grant";
import type { EntitlementsDurableRightGrantRepository } from "../logic/durable-right-grant-repository";

function validInput(): EntitlementsGrantDurableRightInput {
  return {
    subjectId: " account-1 ",
    resourceId: " product-1 ",
    sourceReference: " commerce:order-item:1 ",
    quantity: 3,
    scopeSnapshot: { editionId: "edition-1", seats: 3 },
    grantSnapshot: { basis: "PAID_ORDER", orderId: "order-1" },
    validFrom: new Date("2026-09-02T00:00:00.000Z"),
    validUntil: new Date("2027-09-02T00:00:00.000Z"),
  };
}

describe("Entitlements durable-right grant", () => {
  it("normalizes opaque references and delegates an already-authorized grant fact", async () => {
    let received: EntitlementsGrantDurableRightInput | undefined;
    const repository: EntitlementsDurableRightGrantRepository = {
      async grant(input) {
        received = input;
        return {
          status: "GRANTED",
          value: {
            entitlementId: "entitlement-1",
            subjectId: input.subjectId,
            resourceId: input.resourceId,
            sourceReference: input.sourceReference,
            status: "ACTIVE",
            quantity: input.quantity,
            scopeSnapshot: input.scopeSnapshot,
            grantSnapshot: input.grantSnapshot,
            validFrom: input.validFrom,
            validUntil: input.validUntil ?? null,
            createdAt: new Date("2026-09-02T00:00:01.000Z"),
          },
        };
      },
    };

    const capability = createEntitlementsDurableRightGrantCapability(repository);
    const result = await capability.grant(validInput());

    expect(result.status).toBe("GRANTED");
    expect(received?.subjectId).toBe("account-1");
    expect(received?.resourceId).toBe("product-1");
    expect(received?.sourceReference).toBe("commerce:order-item:1");
  });

  it("rejects invalid validity, quantity, and non-JSON snapshots before persistence", async () => {
    let calls = 0;
    const repository: EntitlementsDurableRightGrantRepository = {
      async grant() {
        calls += 1;
        throw new Error("should not be reached");
      },
    };
    const capability = createEntitlementsDurableRightGrantCapability(repository);

    expect(await capability.grant({ ...validInput(), quantity: 0 })).toEqual({
      status: "FAILED",
      code: "INVALID_INPUT",
    });
    expect(
      await capability.grant({
        ...validInput(),
        validUntil: new Date("2026-09-01T00:00:00.000Z"),
      }),
    ).toEqual({ status: "FAILED", code: "INVALID_INPUT" });
    expect(
      await capability.grant({ ...validInput(), grantSnapshot: { impossible: BigInt(1) } }),
    ).toEqual({ status: "FAILED", code: "INVALID_INPUT" });
    expect(calls).toBe(0);
  });

  it("fails closed when Entitlements persistence is unavailable", async () => {
    const repository: EntitlementsDurableRightGrantRepository = {
      async grant() {
        throw new Error("database unavailable");
      },
    };
    const capability = createEntitlementsDurableRightGrantCapability(repository);

    expect(await capability.grant(validInput())).toEqual({
      status: "FAILED",
      code: "PERSISTENCE_UNAVAILABLE",
    });
  });
});

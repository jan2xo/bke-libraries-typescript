import { describe, expect, it } from "vitest";
import type { EntitlementsRevokeDurableRightInput } from "../contracts/durable-right-revocation.contract";
import { createEntitlementsDurableRightRevocationCapability } from "../logic/durable-right-revocation";
import type { EntitlementsDurableRightRevocationRepository } from "../logic/durable-right-revocation-repository";

function validInput(): EntitlementsRevokeDurableRightInput {
  return {
    entitlementId: " entitlement-1 ",
    revocationReference: " refund:paymongo:refund-1 ",
    revocationSnapshot: { reason: "REFUND_CONFIRMED", orderId: "order-1" },
    revokedAt: new Date("2026-09-23T03:30:00.000Z"),
  };
}

describe("Entitlements durable-right revocation", () => {
  it("normalizes authorized revocation facts before persistence", async () => {
    let received: EntitlementsRevokeDurableRightInput | undefined;
    const repository: EntitlementsDurableRightRevocationRepository = {
      async revoke(input) {
        received = input;
        return {
          status: "REVOKED",
          value: {
            entitlementId: input.entitlementId,
            status: "REVOKED",
            revocationReference: input.revocationReference,
            revocationSnapshot: input.revocationSnapshot,
            revokedAt: input.revokedAt,
          },
        };
      },
    };

    const capability = createEntitlementsDurableRightRevocationCapability(repository);
    const result = await capability.revoke(validInput());

    expect(result.status).toBe("REVOKED");
    expect(received?.entitlementId).toBe("entitlement-1");
    expect(received?.revocationReference).toBe("refund:paymongo:refund-1");
  });

  it("rejects malformed revocation facts before persistence", async () => {
    let calls = 0;
    const repository: EntitlementsDurableRightRevocationRepository = {
      async revoke() {
        calls += 1;
        throw new Error("should not run");
      },
    };
    const capability = createEntitlementsDurableRightRevocationCapability(repository);

    expect(await capability.revoke({ ...validInput(), entitlementId: " " })).toEqual({
      status: "FAILED",
      code: "INVALID_INPUT",
    });
    expect(await capability.revoke({ ...validInput(), revocationSnapshot: { bad: BigInt(1) } })).toEqual({
      status: "FAILED",
      code: "INVALID_INPUT",
    });
    expect(await capability.revoke({ ...validInput(), revokedAt: new Date("invalid") })).toEqual({
      status: "FAILED",
      code: "INVALID_INPUT",
    });
    expect(calls).toBe(0);
  });

  it("fails closed when persistence is unavailable", async () => {
    const capability = createEntitlementsDurableRightRevocationCapability({
      async revoke() {
        throw new Error("database unavailable");
      },
    });

    expect(await capability.revoke(validInput())).toEqual({
      status: "FAILED",
      code: "PERSISTENCE_UNAVAILABLE",
    });
  });
});

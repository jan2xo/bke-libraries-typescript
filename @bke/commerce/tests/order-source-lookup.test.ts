import { describe, expect, it } from "vitest";
import { createCommerceOrderSourceLookupCapability } from "../logic/order-source-lookup";
import type { CommerceOrderSourceLookupRepository } from "../logic/order-source-lookup-repository";

const snapshot = {
  orderId: "order-1",
  orderNumber: "BKE-2026-RECOVERY",
  accountId: "account-1",
  sourceReference: "agent-checkout:session-1:correlation-1",
  fulfillmentMode: "CLAIM_CODE" as const,
  status: "PENDING" as const,
  currency: "PHP",
  totalMinor: 300_000,
  paidAt: null,
  createdAt: new Date("2026-09-24T00:00:00.000Z"),
};

describe("Commerce order source lookup", () => {
  it("returns the exact order bound to a checkout source reference", async () => {
    let requested = "";
    const repository: CommerceOrderSourceLookupRepository = {
      async findBySourceReference(sourceReference) {
        requested = sourceReference;
        return sourceReference === snapshot.sourceReference ? snapshot : null;
      },
    };
    const capability = createCommerceOrderSourceLookupCapability(repository);
    const result = await capability.find({
      sourceReference: `  ${snapshot.sourceReference}  `,
    });

    expect(requested).toBe(snapshot.sourceReference);
    expect(result).toEqual({ status: "FOUND", value: snapshot });
  });

  it("returns NOT_FOUND without inventing an order", async () => {
    const capability = createCommerceOrderSourceLookupCapability({
      async findBySourceReference() {
        return null;
      },
    });
    await expect(
      capability.find({ sourceReference: "agent-checkout:session-1:missing" }),
    ).resolves.toEqual({ status: "NOT_FOUND" });
  });

  it("fails closed on invalid source references and persistence failure", async () => {
    const invalid = createCommerceOrderSourceLookupCapability({
      async findBySourceReference() {
        throw new Error("must not call");
      },
    });
    await expect(invalid.find({ sourceReference: " " })).resolves.toEqual({
      status: "FAILED",
      code: "INVALID_INPUT",
    });

    const unavailable = createCommerceOrderSourceLookupCapability({
      async findBySourceReference() {
        throw new Error("db unavailable");
      },
    });
    await expect(
      unavailable.find({ sourceReference: "agent-checkout:session-1:corr" }),
    ).resolves.toEqual({
      status: "FAILED",
      code: "PERSISTENCE_UNAVAILABLE",
    });
  });
});

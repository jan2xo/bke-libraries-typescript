import { describe, expect, it } from "vitest";
import { createPaymentsCheckoutAttemptCapability } from "../logic/checkout-attempt";
import type {
  PaymentsCheckoutAttemptClaim,
  PaymentsCheckoutAttemptRecord,
  PaymentsCheckoutAttemptRepository,
} from "../logic/checkout-attempt-repository";
import {
  PaymentsProviderError,
  type PaymentsCheckoutProvider,
} from "../logic/checkout-attempt-provider";

function repository(): PaymentsCheckoutAttemptRepository {
  const records = new Map<string, PaymentsCheckoutAttemptRecord>();
  const now = () => new Date("2026-09-02T00:00:00.000Z");
  return {
    async claim(input: PaymentsCheckoutAttemptClaim) {
      const existing = records.get(input.sourceReference);
      if (existing) return { created: false, record: existing };
      const record: PaymentsCheckoutAttemptRecord = {
        ...input,
        status: "CREATING",
        externalCheckoutId: null,
        checkoutUrl: null,
        failureCode: null,
        createdAt: now(),
        updatedAt: now(),
      };
      records.set(input.sourceReference, record);
      return { created: true, record };
    },
    async markPending(id, externalCheckoutId, checkoutUrl) {
      const entry = [...records.entries()].find(([, value]) => value.id === id);
      if (!entry) throw new Error("missing");
      const record = { ...entry[1], status: "PENDING" as const, externalCheckoutId, checkoutUrl, failureCode: null, updatedAt: now() };
      records.set(entry[0], record);
      return record;
    },
    async markFailed(id, failureCode) {
      const entry = [...records.entries()].find(([, value]) => value.id === id);
      if (!entry) throw new Error("missing");
      const record = { ...entry[1], status: "FAILED" as const, failureCode, updatedAt: now() };
      records.set(entry[0], record);
      return record;
    },
  };
}

const input = {
  sourceReference: "checkout:order-123",
  commercialReference: "BKE-2026-00123",
  amountMinor: 300_000,
  currency: "php",
  payer: { name: "BKE Customer", email: "Customer@Example.com" },
  items: [{ name: "Air Stack", description: "Annual license", amountMinor: 300_000, quantity: 1 }],
} as const;

describe("Payments checkout attempt", () => {
  it("creates one provider checkout and returns the existing checkout on an exact retry", async () => {
    let calls = 0;
    const provider: PaymentsCheckoutProvider = {
      name: "fakepay",
      async createCheckout(request) {
        calls += 1;
        return { externalCheckoutId: `checkout-${request.idempotencyKey}`, checkoutUrl: "https://pay.example/checkout" };
      },
    };
    const capability = createPaymentsCheckoutAttemptCapability(repository(), provider);

    const first = await capability.create(input);
    const second = await capability.create(input);

    expect(first.status).toBe("READY");
    expect(first.status === "READY" && first.disposition).toBe("CREATED");
    expect(second.status).toBe("READY");
    expect(second.status === "READY" && second.disposition).toBe("EXISTING");
    expect(calls).toBe(1);
  });

  it("rejects conflicting reuse of the source reference", async () => {
    const provider: PaymentsCheckoutProvider = {
      name: "fakepay",
      async createCheckout() {
        return { externalCheckoutId: "checkout-1", checkoutUrl: "https://pay.example/checkout" };
      },
    };
    const capability = createPaymentsCheckoutAttemptCapability(repository(), provider);
    await capability.create(input);
    const conflict = await capability.create({ ...input, amountMinor: 400_000, items: [{ ...input.items[0], amountMinor: 400_000 }] });
    expect(conflict).toEqual({ status: "REJECTED", code: "SOURCE_CONFLICT" });
  });

  it("records provider failure semantics without inventing settlement state", async () => {
    const provider: PaymentsCheckoutProvider = {
      name: "fakepay",
      async createCheckout() {
        throw new PaymentsProviderError("PROVIDER_UNAVAILABLE");
      },
    };
    const capability = createPaymentsCheckoutAttemptCapability(repository(), provider);
    await expect(capability.create(input)).resolves.toEqual({ status: "FAILED", code: "PROVIDER_UNAVAILABLE" });
  });

  it("fails closed on invalid or internally inconsistent priced requests", async () => {
    const provider: PaymentsCheckoutProvider = { name: "fakepay", async createCheckout() { throw new Error("must not call"); } };
    const capability = createPaymentsCheckoutAttemptCapability(repository(), provider);
    await expect(capability.create({ ...input, amountMinor: 0 })).resolves.toEqual({ status: "FAILED", code: "INVALID_INPUT" });
    await expect(capability.create({ ...input, amountMinor: 200_000 })).resolves.toEqual({ status: "FAILED", code: "INVALID_INPUT" });
  });
});

import { describe, expect, it } from "vitest";
import { createPaymentsProviderEventIngestionCapability } from "../logic/provider-event-ingestion";
import type {
  PaymentsProviderEventClaim,
  PaymentsProviderEventRecord,
  PaymentsProviderEventRepository,
} from "../logic/provider-event-repository";
import type {
  PaymentsProviderEventVerifier,
  PaymentsVerifiedProviderEvent,
} from "../logic/provider-event-verifier";

function repository(): PaymentsProviderEventRepository {
  const records = new Map<string, PaymentsProviderEventRecord>();
  return {
    async claim(input: PaymentsProviderEventClaim) {
      const key = `${input.provider}:${input.eventId}`;
      const existing = records.get(key);
      if (existing) return { created: false, record: existing };
      const record: PaymentsProviderEventRecord = {
        ...input,
        receivedAt: new Date("2026-09-02T00:00:01.000Z"),
      };
      records.set(key, record);
      return { created: true, record };
    },
  };
}

const verifiedEvent: PaymentsVerifiedProviderEvent = {
  eventId: "evt_123",
  rawType: "payment.paid",
  type: "payment.paid",
  externalPaymentId: "pay_123",
  externalCheckoutId: "cs_123",
  reference: "BKE-2026-00123",
  amountMinor: 300_000,
  currency: "php",
  livemode: false,
  occurredAt: new Date("2026-09-02T00:00:00.000Z"),
};

function verifier(event: PaymentsVerifiedProviderEvent = verifiedEvent): PaymentsProviderEventVerifier {
  return {
    name: "fakepay",
    async verifyAndParse() {
      return event;
    },
  };
}

describe("Payments provider-event ingestion", () => {
  it("verifies, normalizes, and replay-protects an exact provider event", async () => {
    let calls = 0;
    const wrapped: PaymentsProviderEventVerifier = {
      name: "fakepay",
      async verifyAndParse() {
        calls += 1;
        return verifiedEvent;
      },
    };
    const capability = createPaymentsProviderEventIngestionCapability(repository(), wrapped);
    const input = { rawBody: new TextEncoder().encode('{"id":"evt_123"}'), headers: { signature: "valid" } };

    const first = await capability.ingest(input);
    const second = await capability.ingest(input);

    expect(first.status).toBe("VERIFIED");
    expect(first.status === "VERIFIED" && first.disposition).toBe("CREATED");
    expect(first.status === "VERIFIED" && first.value.currency).toBe("PHP");
    expect(second.status).toBe("VERIFIED");
    expect(second.status === "VERIFIED" && second.disposition).toBe("EXISTING");
    expect(calls).toBe(2);
  });

  it("rejects conflicting payload reuse of the same verified provider event id", async () => {
    const store = repository();
    const capability = createPaymentsProviderEventIngestionCapability(store, verifier());
    await capability.ingest({ rawBody: new TextEncoder().encode("payload-a"), headers: {} });
    const conflict = await capability.ingest({ rawBody: new TextEncoder().encode("payload-b"), headers: {} });
    expect(conflict).toEqual({ status: "REJECTED", code: "EVENT_CONFLICT" });
  });

  it("fails closed when provider verification fails", async () => {
    const capability = createPaymentsProviderEventIngestionCapability(repository(), {
      name: "fakepay",
      async verifyAndParse() {
        throw new Error("bad signature");
      },
    });
    await expect(
      capability.ingest({ rawBody: new TextEncoder().encode("payload"), headers: {} }),
    ).resolves.toEqual({ status: "FAILED", code: "VERIFICATION_FAILED" });
  });

  it("accepts verified unknown events without inventing settlement semantics", async () => {
    const capability = createPaymentsProviderEventIngestionCapability(
      repository(),
      verifier({
        eventId: "evt_unknown",
        rawType: "future.provider.event",
        type: "unknown",
        livemode: false,
        occurredAt: new Date("2026-09-02T00:00:00.000Z"),
      }),
    );
    const result = await capability.ingest({ rawBody: new TextEncoder().encode("unknown"), headers: {} });
    expect(result.status).toBe("VERIFIED");
    expect(result.status === "VERIFIED" && result.value.type).toBe("unknown");
  });
});

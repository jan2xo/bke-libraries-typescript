import { describe, expect, it } from "vitest";
import { createPaymentsPaymentIntentCapability } from "../logic/payment-intent";
import type { PaymentsPaymentIntentAttemptClaim, PaymentsPaymentIntentAttemptRecord, PaymentsPaymentIntentAttemptRepository, PaymentsPaymentIntentAttemptStatus } from "../logic/payment-intent-repository";
import type { PaymentsPaymentIntentProvider } from "../logic/payment-intent-provider";
function repository(): PaymentsPaymentIntentAttemptRepository {
  const rows = new Map<string, PaymentsPaymentIntentAttemptRecord>();
  const source = new Map<string, string>();
  const intent = new Map<string, string>();
  const stateOf = (status: Parameters<PaymentsPaymentIntentAttemptRepository["updateStatus"]>[1]): PaymentsPaymentIntentAttemptStatus =>
    status === "awaiting_payment_method" ? "AWAITING_PAYMENT_METHOD" :
    status === "awaiting_next_action" ? "AWAITING_NEXT_ACTION" :
    status === "processing" ? "PROCESSING" : status === "succeeded" ? "SUCCEEDED" : "CANCELLED";
  return {
    async findById(id) { return rows.get(id) ?? null; },
    async findByProviderIntent(provider, id) { const key = intent.get(provider + "|" + id); return key ? rows.get(key) ?? null : null; },
    async claim(input: PaymentsPaymentIntentAttemptClaim) {
      const old = source.get(input.sourceReference);
      if (old) return { created: false, record: rows.get(old)! };
      const row: PaymentsPaymentIntentAttemptRecord = {
        ...input, paymentMethodAllowed: [...input.paymentMethodAllowed], createDispatchedAt: null,
        createLeaseUntil: null, createLeaseToken: null, statusObservedAt: null, paymentIntentId: null,
        status: "CREATING", failureCode: null, createdAt: new Date(), updatedAt: new Date(),
      };
      rows.set(row.id, row); source.set(row.sourceReference, row.id);
      return { created: true, record: row };
    },
    async beginCreate(id, now, ms) {
      const row = rows.get(id)!;
      if (row.paymentIntentId) return { status: "ALREADY_BOUND", record: row };
      if (row.idempotencyExpiresAt <= now) return { status: "EXPIRED", record: row };
      if (row.createLeaseUntil && row.createLeaseUntil > now) return { status: "BUSY", record: row };
      const next = { ...row, createDispatchedAt: row.createDispatchedAt ?? now,
        createLeaseUntil: new Date(now.getTime() + ms), createLeaseToken: crypto.randomUUID() };
      rows.set(id, next);
      return { status: "ACQUIRED", record: next };
    },
    async markUnknown(id, leaseToken) {
      const row = rows.get(id)!;
      if (row.createLeaseToken !== leaseToken || row.paymentIntentId) return false;
      rows.set(id, { ...row, status: "UNKNOWN", createLeaseUntil: null, createLeaseToken: null });
      return true;
    },
    async markFailed(id, code, leaseToken) {
      const row = rows.get(id)!;
      if (row.createLeaseToken !== leaseToken || row.paymentIntentId) return false;
      rows.set(id, { ...row, status: "FAILED", failureCode: code, createLeaseUntil: null, createLeaseToken: null });
      return true;
    },
    async updateStatus(id, status, observedAt) {
      const row = rows.get(id)!;
      if (!row.paymentIntentId) throw new Error("Intent not bound");
      const state = stateOf(status);
      if ((row.statusObservedAt && row.statusObservedAt >= observedAt) ||
          ((row.status === "SUCCEEDED" || row.status === "CANCELLED") && row.status !== state)) return row;
      const next: PaymentsPaymentIntentAttemptRecord = { ...row, status: state, statusObservedAt: observedAt };
      rows.set(id, next);
      return next;
    },
    async bindPaymentIntent(id, paymentIntentId, status, leaseToken, observedAt) {
      const row = rows.get(id)!;
      if (row.paymentIntentId === paymentIntentId) return row;
      if (row.paymentIntentId || row.createLeaseToken !== leaseToken) throw new Error("PI_CONFLICT_OR_STALE_LEASE");
      const next: PaymentsPaymentIntentAttemptRecord = {
        ...row, paymentIntentId, status: stateOf(status), statusObservedAt: observedAt,
        createLeaseUntil: null, createLeaseToken: null,
      };
      rows.set(id, next); intent.set(row.provider + "|" + paymentIntentId, id);
      return next;
    },
  };
}
const input={sourceReference:"source-test-1",commercialReference:"order-test-1",amountMinor:12500,currency:"PHP",livemode:false,paymentMethodAllowed:["qrph"]};
function provider(overrides: Partial<PaymentsPaymentIntentProvider> = {}): PaymentsPaymentIntentProvider {
  return {
    name:"paymongo",livemode:false,
    async createPaymentIntent(x){return {paymentIntentId:"pi_test_1",clientKey:"client_key_1",status:"awaiting_payment_method",amountMinor:x.amountMinor,currency:x.currency,livemode:false};},
    async retrievePaymentIntent(id){return {paymentIntentId:id,clientKey:"client_key_1",status:"awaiting_payment_method",amountMinor:12500,currency:"PHP",livemode:false};},
    async createPaymentMethod(x){return {paymentMethodId:"pm_test_1",type:x.type};},
    async attachPaymentMethod(x){return {paymentIntentId:x.paymentIntentId,status:"awaiting_next_action",qrImageUrl:"https://example.invalid/qr.png"};},
    ...overrides,
  };
}
describe("Payments Payment Intent",()=>{
  it("creates once and returns the existing intent for a repeated source reference",async()=>{
    const p=provider();let count=0;const original=p.createPaymentIntent.bind(p);p.createPaymentIntent=async(x)=>{count++;return original(x);};
    const cap=createPaymentsPaymentIntentCapability(repository(),p);
    const first=await cap.create(input);expect(first.status).toBe("READY");
    const second=await cap.create(input);expect(second.status).toBe("READY");
    if(first.status==="READY" && second.status==="READY"){expect(first.value.paymentIntentId).toBe("pi_test_1");expect(second.disposition).toBe("EXISTING");}
    expect(count).toBe(1);
  });
  it("retries an uncertain create with the exact durable idempotency key",async()=>{
    const keys:string[]=[];let n=0;const p=provider({async createPaymentIntent(x){keys.push(x.idempotencyKey);if(++n===1)throw new Error("timeout");return {paymentIntentId:"pi_test_2",clientKey:"ck2",status:"awaiting_payment_method",amountMinor:x.amountMinor,currency:x.currency,livemode:false};}});
    const cap=createPaymentsPaymentIntentCapability(repository(),p);
    expect(await cap.create({...input,sourceReference:"source-test-2"})).toMatchObject({status:"FAILED",code:"PROVIDER_UNAVAILABLE"});
    expect((await cap.create({...input,sourceReference:"source-test-2"})).status).toBe("READY");
    expect(keys.length).toBe(2);expect(keys[0]).toBe(keys[1]);
  });
  it("fails closed for changed amount and unsupported method",async()=>{
    const cap=createPaymentsPaymentIntentCapability(repository(),provider());expect((await cap.create(input)).status).toBe("READY");
    expect(await cap.create({...input,amountMinor:13000})).toMatchObject({status:"REJECTED",code:"SOURCE_CONFLICT"});
  });

  it("rejects mode mismatches and refuses new resources when creation is disabled", async () => {
    const p = provider();
    let creates = 0;
    const original = p.createPaymentIntent.bind(p);
    p.createPaymentIntent = async (request) => { creates += 1; return original(request); };
    const modeMismatch = await createPaymentsPaymentIntentCapability(repository(), p).create({ ...input, livemode: true });
    expect(modeMismatch).toEqual({ status: "FAILED", code: "MODE_MISMATCH" });
    const disabled = await createPaymentsPaymentIntentCapability(repository(), p, { creationEnabled: false }).create({
      ...input, sourceReference: "source-disabled",
    });
    expect(disabled).toEqual({ status: "FAILED", code: "CREATION_DISABLED" });
    expect(creates).toBe(0);
  });

  it("recovers a lost attach response and permits a fresh QR method on the same intent after expiry", async () => {
    const repo = repository();
    let currentStatus: "awaiting_payment_method" | "awaiting_next_action" = "awaiting_payment_method";
    let attachCalls = 0;
    let methodCalls = 0;
    const p = provider({
      async retrievePaymentIntent(id) {
        return {
          paymentIntentId: id, clientKey: "client_key_1", status: currentStatus,
          amountMinor: 12500, currency: "PHP", livemode: false,
          ...(currentStatus === "awaiting_next_action" ? { qrImageUrl: "data:image/png;base64,QUJD" } : {}),
        };
      },
      async createPaymentMethod(x) {
        methodCalls += 1;
        return { paymentMethodId: "pm_test_" + methodCalls, type: x.type };
      },
      async attachPaymentMethod(x) {
        attachCalls += 1;
        currentStatus = "awaiting_next_action";
        throw new Error("provider accepted attach; response lost");
      },
    });
    const cap = createPaymentsPaymentIntentCapability(repo, p);
    const created = await cap.create(input);
    expect(created.status).toBe("READY");
    if (created.status !== "READY") throw new Error("expected ready PI");
    const firstMethod = await cap.createPaymentMethod({ attemptId: created.value.attemptId, type: "qrph" });
    expect(firstMethod.status).toBe("CREATED");
    expect(await cap.attachPaymentMethod({
      attemptId: created.value.attemptId, paymentMethodId: "pm_test_1", clientKey: "client_key_1",
    })).toMatchObject({ status: "FAILED", code: "PROVIDER_UNAVAILABLE" });
    const recovered = await cap.attachPaymentMethod({
      attemptId: created.value.attemptId, paymentMethodId: "pm_test_1", clientKey: "client_key_1",
    });
    expect(recovered).toMatchObject({
      status: "ATTACHED", value: { paymentIntentId: "pi_test_1", status: "awaiting_next_action", qrImageUrl: "data:image/png;base64,QUJD" },
    });
    expect(attachCalls).toBe(1);

    currentStatus = "awaiting_payment_method";
    const replacement = await cap.createPaymentMethod({ attemptId: created.value.attemptId, type: "qrph" });
    expect(replacement).toMatchObject({ status: "CREATED", value: { paymentMethodId: "pm_test_2" } });
    expect(methodCalls).toBe(2);
    expect(attachCalls).toBe(1);
  });
});

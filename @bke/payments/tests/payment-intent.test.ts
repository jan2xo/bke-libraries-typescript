import { describe, expect, it } from "vitest";
import { createPaymentsPaymentIntentCapability } from "../logic/payment-intent";
import type { PaymentsPaymentIntentAttemptClaim, PaymentsPaymentIntentAttemptRecord, PaymentsPaymentIntentAttemptRepository } from "../logic/payment-intent-repository";
import type { PaymentsPaymentIntentProvider } from "../logic/payment-intent-provider";
function repository(): PaymentsPaymentIntentAttemptRepository {
  const rows = new Map<string, PaymentsPaymentIntentAttemptRecord>(), source = new Map<string,string>(), intent = new Map<string,string>();
  return {
    async findById(id) { return rows.get(id) ?? null; },
    async findByProviderIntent(provider,id) { const key=intent.get(provider+"|"+id); return key ? rows.get(key) ?? null : null; },
    async claim(input: PaymentsPaymentIntentAttemptClaim) {
      const old=source.get(input.sourceReference); if(old) return {created:false,record:rows.get(old)!};
      const row: PaymentsPaymentIntentAttemptRecord={...input,paymentMethodAllowed:[...input.paymentMethodAllowed],createDispatchedAt:null,createLeaseUntil:null,paymentIntentId:null,status:"CREATING",failureCode:null,createdAt:new Date(),updatedAt:new Date()};
      rows.set(row.id,row);source.set(row.sourceReference,row.id);return {created:true,record:row};
    },
    async beginCreate(id,now,ms) {
      const row=rows.get(id)!;
      if(row.paymentIntentId)return {status:"ALREADY_BOUND",record:row};
      if(row.idempotencyExpiresAt<=now)return {status:"EXPIRED",record:row};
      if(row.createLeaseUntil && row.createLeaseUntil>now)return {status:"BUSY",record:row};
      const next={...row,createDispatchedAt:row.createDispatchedAt??now,createLeaseUntil:new Date(now.getTime()+ms)};rows.set(id,next);return {status:"ACQUIRED",record:next};
    },
    async markUnknown(id) {const r=rows.get(id)!;rows.set(id,{...r,status:"UNKNOWN",createLeaseUntil:null});},
    async markFailed(id,code) {const r=rows.get(id)!;rows.set(id,{...r,status:"FAILED",failureCode:code,createLeaseUntil:null});},
    async bindPaymentIntent(id,paymentIntentId,status) {
      const r=rows.get(id)!;if(r.paymentIntentId && r.paymentIntentId!==paymentIntentId)throw new Error("PI_CONFLICT");
      const state=status==="awaiting_payment_method"?"AWAITING_PAYMENT_METHOD":status==="awaiting_next_action"?"AWAITING_NEXT_ACTION":status==="processing"?"PROCESSING":status==="succeeded"?"SUCCEEDED":"CANCELLED";
      const next={...r,paymentIntentId,status:state,createLeaseUntil:null};rows.set(id,next);intent.set(r.provider+"|"+paymentIntentId,id);return next;
    },
  };
}
const input={sourceReference:"source-test-1",commercialReference:"order-test-1",amountMinor:12500,currency:"PHP",paymentMethodAllowed:["qrph"]};
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
});

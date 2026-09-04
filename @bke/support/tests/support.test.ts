import { describe, expect, it } from "vitest";
import type { SupportContextPort, SupportTicketSnapshot } from "../contracts/support.contract";
import { createSupportCommandCapability, createSupportQueryCapability, supportPublicId } from "../logic/support";
import type { SupportRepository } from "../logic/support-repository";

const fixed = new Date("2026-09-05T00:00:00.000Z");
const baseTicket: SupportTicketSnapshot = Object.freeze({ id:"ticket-1",publicId:"BKE-SUP-2026-AAAAAAAAAA",createdById:"user-1",accountId:"account-1",orderId:null,licenseId:null,category:"OTHER",state:"OPEN",priority:"NORMAL",subject:"Need help",safeContext:{account:{id:"account-1"}},securityReport:false,assignedToId:null,lastCustomerReplyAt:fixed,lastAdminReplyAt:null,escalatedAt:null,resolvedAt:null,closedAt:null,createdAt:fixed,updatedAt:fixed,messages:Object.freeze([]),events:Object.freeze([]) });
function repo(overrides: Partial<SupportRepository> = {}): SupportRepository { return { async createTicket(){return baseTicket;},async customerReply(){return {status:"OK",value:{...baseTicket,state:"WAITING_ON_SUPPORT"}};},async adminUpdate(){return baseTicket;},async listCustomerTickets(){return [baseTicket];},async listAdminTickets(){return [baseTicket];},...overrides }; }
const context: SupportContextPort = { async resolve(){ return {status:"AUTHORIZED",safeContext:{account:{id:"account-1"},token:"secret"}}; } };
let sequence=0; const id=()=>`id-${++sequence}`;

describe("support V1 domain parity",()=>{
  it("keeps the public ticket id shape",()=>{ expect(supportPublicId(fixed,"12345678-1234-1234-1234-123456789abc")).toBe("BKE-SUP-2026-1234567812"); });
  it("forces SECURITY reports to URGENT, redacts context, and emits audit plus notification intents",async()=>{
    let captured:any; const commands=createSupportCommandCapability({repository:repo({async createTicket(input){captured=input;return {...baseTicket,id:input.ticketId,publicId:input.publicId,category:input.category,priority:input.priority,securityReport:input.securityReport,safeContext:input.safeContext};}}),context,now:()=>fixed,randomId:id});
    const result=await commands.createTicket({userId:"user-1",accountId:"account-1",category:"SECURITY",priority:"LOW",subject:"Security issue",body:"Something happened",supportNotificationRecipient:"support@jl-bke.com"});
    expect(result.status).toBe("OK"); if(result.status!=="OK") return;
    expect(captured.priority).toBe("URGENT"); expect(captured.securityReport).toBe(true); expect(captured.safeContext.token).toBe("[REDACTED]");
    expect(result.effects.map((effect)=>effect.kind)).toEqual(["AUDIT","NOTIFICATION"]);
  });
  it("preserves closed/resolved customer reply rejection",async()=>{ const commands=createSupportCommandCapability({repository:repo({async customerReply(){return {status:"INVALID_STATE"};}}),context,now:()=>fixed,randomId:id}); const result=await commands.customerReply({userId:"user-1",ticketId:"ticket-1",accessibleAccountIds:["account-1"],body:"Hello"}); expect(result).toEqual({status:"REJECTED",code:"INVALID_STATE"}); });
  it("requires a customer recipient for a public admin reply and emits reply plus audit effects",async()=>{ const commands=createSupportCommandCapability({repository:repo(),context,now:()=>fixed,randomId:id}); expect(await commands.adminUpdate({adminId:"admin-1",ticketId:"ticket-1",body:"Reply"})).toEqual({status:"FAILED",code:"INVALID_INPUT"}); const result=await commands.adminUpdate({adminId:"admin-1",ticketId:"ticket-1",body:"Reply",customerEmail:"customer@example.com"}); expect(result.status).toBe("OK"); if(result.status==="OK") expect(result.effects.map((effect)=>effect.kind)).toEqual(["AUDIT","NOTIFICATION"]); });
  it("keeps customer and admin query limits bounded",async()=>{ const queries=createSupportQueryCapability(repo()); expect((await queries.listCustomerTickets({userId:"user-1",accessibleAccountIds:[]})).status).toBe("OK"); expect(await queries.listCustomerTickets({userId:"user-1",accessibleAccountIds:[],limit:101})).toEqual({status:"FAILED",code:"INVALID_INPUT"}); expect(await queries.listAdminTickets(201)).toEqual({status:"FAILED",code:"INVALID_INPUT"}); });
});

import { strict as assert } from "node:assert";
import { Client } from "pg";
import type { SupportContextPort } from "../contracts/support.contract";
import { createSupportCommandCapability, createSupportQueryCapability } from "../logic/support";
import { createPostgresSupportRepository } from "../prisma/repositories/postgres-support-repository";

const url=process.env.DATABASE_URL; if(!url) throw new Error("DATABASE_URL is required");
const repository=createPostgresSupportRepository(url); const now=new Date("2026-09-05T00:00:00Z"); let n=0; const randomId=()=>`support-cert-${++n}`;
const context:SupportContextPort={async resolve(input){ if(input.orderId==="missing") return {status:"REJECTED",code:"ORDER_NOT_FOUND"}; return {status:"AUTHORIZED",safeContext:{account:{id:input.accountId,displayName:"Certified Account"},order:input.orderId?{id:input.orderId}:undefined,apiKey:"must-redact"}}; }};
const commands=createSupportCommandCapability({repository,context,now:()=>now,randomId}); const queries=createSupportQueryCapability(repository);
const created=await commands.createTicket({userId:"customer-1",accountId:"account-1",category:"SECURITY",priority:"LOW",subject:"Security certification",body:"Certified support body",orderId:"order-1",supportNotificationRecipient:"support@jl-bke.com"});
assert.equal(created.status,"OK"); if(created.status!=="OK") process.exit(1); const id=created.value.id; assert.equal(created.value.priority,"URGENT"); assert.equal(created.value.securityReport,true); assert.equal((created.value.safeContext as any).apiKey,"[REDACTED]"); assert.equal(created.value.messages.length,1); assert.equal(created.value.events?.[0]?.eventType,"SECURITY_REPORT_CREATED"); assert.equal(created.effects.length,2);
const memberList=await queries.listCustomerTickets({userId:"member-2",accessibleAccountIds:["account-1"]}); assert.equal(memberList.status,"OK"); if(memberList.status==="OK") assert.equal(memberList.values.length,1);
const replied=await commands.customerReply({userId:"member-2",ticketId:id,accessibleAccountIds:["account-1"],body:"Member reply"}); assert.equal(replied.status,"OK"); if(replied.status==="OK") assert.equal(replied.value.state,"WAITING_ON_SUPPORT");
const internal=await commands.adminUpdate({adminId:"admin-1",ticketId:id,internalNote:"Internal only",state:"TRIAGED"}); assert.equal(internal.status,"OK");
const customerView=await queries.listCustomerTickets({userId:"customer-1",accessibleAccountIds:[]}); assert.equal(customerView.status,"OK"); if(customerView.status==="OK"){ assert.equal(customerView.values[0]!.messages.some((message)=>message.visibility==="INTERNAL"),false); assert.equal(customerView.values[0]!.events,undefined); }
const publicReply=await commands.adminUpdate({adminId:"admin-1",ticketId:id,body:"Public response",customerEmail:"customer@example.com",state:"RESOLVED"}); assert.equal(publicReply.status,"OK"); if(publicReply.status==="OK") assert.equal(publicReply.effects.some((effect)=>effect.kind==="NOTIFICATION"&&effect.messageType==="SUPPORT_TICKET_REPLY"),true);
const rejected=await commands.customerReply({userId:"customer-1",ticketId:id,accessibleAccountIds:[],body:"Cannot reply now"}); assert.deepEqual(rejected,{status:"REJECTED",code:"INVALID_STATE"});
const admin=await queries.listAdminTickets(); assert.equal(admin.status,"OK"); if(admin.status==="OK"){ assert.equal(admin.values[0]!.messages.some((message)=>message.visibility==="INTERNAL"),true); assert.equal((admin.values[0]!.events?.length??0)>=4,true); }
const missing=await commands.createTicket({userId:"customer-1",accountId:"account-1",category:"OTHER",subject:"Missing order",body:"Context should reject",orderId:"missing",supportNotificationRecipient:"support@jl-bke.com"}); assert.deepEqual(missing,{status:"REJECTED",code:"ORDER_NOT_FOUND"});
const db=new Client({connectionString:url}); await db.connect(); const counts=await db.query(`SELECT (SELECT COUNT(*) FROM "SupportTicket")::int AS tickets,(SELECT COUNT(*) FROM "SupportTicketMessage")::int AS messages,(SELECT COUNT(*) FROM "SupportTicketEvent")::int AS events`); await db.end(); assert.equal(counts.rows[0].tickets,1); assert.equal(counts.rows[0].messages,4); assert.equal(counts.rows[0].events,4);
console.log("Support PostgreSQL behavior GREEN");

import{describe,expect,it,vi}from"vitest";
import type{IdentityPrincipal}from"../contracts/identity.contract";
import type{IdentityGoogleIdentityRepository}from"../logic/google-identity-repository";
import{createIdentityGooglePrincipalBindingCapability}from"../logic/google-identity";
const principal:IdentityPrincipal={id:"u1",email:"x@example.com",name:null,emailVerified:new Date(),role:"CUSTOMER",establishedAt:new Date(),suspendedAt:null,lifecycleState:"ACTIVE"};
const repo=(o:Partial<IdentityGoogleIdentityRepository>={}):IdentityGoogleIdentityRepository=>({bindSubject:vi.fn(async()=>({status:"BOUND" as const})),findPrincipalBySubject:vi.fn(async()=>principal),...o});
describe("Google OIDC principal binding",()=>{
 it("binds an explicit user id to a validated stable subject",async()=>{const r=repo();const c=createIdentityGooglePrincipalBindingCapability(r);await expect(c.bindToUser({userId:" u1 ",subject:"subject-1"})).resolves.toEqual({status:"BOUND",userId:"u1"});expect(r.bindSubject).toHaveBeenCalledWith("u1","subject-1")});
 it("looks up only by subject",async()=>{const r=repo();await expect(createIdentityGooglePrincipalBindingCapability(r).findPrincipalBySubject({subject:"opaque"})).resolves.toEqual({status:"FOUND",principal});expect(r.findPrincipalBySubject).toHaveBeenCalledWith("opaque")});
 it.each([""," spaced ","x".repeat(256),"tést","bad\u0000subject"])("rejects malformed subject",async subject=>{const r=repo();await expect(createIdentityGooglePrincipalBindingCapability(r).bindToUser({userId:"u1",subject})).resolves.toEqual({status:"FAILED",code:"INVALID_INPUT"});expect(r.bindSubject).not.toHaveBeenCalled()});
 it.each(["SUBJECT_ALREADY_BOUND","USER_ALREADY_BOUND","ACCOUNT_NOT_ACTIVE"] as const)("preserves rejection %s",async status=>{const c=createIdentityGooglePrincipalBindingCapability(repo({bindSubject:vi.fn(async()=>({status}))}));await expect(c.bindToUser({userId:"u1",subject:"s"})).resolves.toEqual({status:"REJECTED",code:status})});
 it("fails closed on persistence errors",async()=>{const c=createIdentityGooglePrincipalBindingCapability(repo({bindSubject:vi.fn(async()=>{throw Error()})}));await expect(c.bindToUser({userId:"u1",subject:"s"})).resolves.toEqual({status:"FAILED",code:"PERSISTENCE_UNAVAILABLE"})})
});

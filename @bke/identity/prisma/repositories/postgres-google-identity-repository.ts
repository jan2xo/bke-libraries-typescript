import {Client} from "pg";
import type {IdentityLifecycleState,IdentityPrincipal,IdentityRole} from "../../contracts/identity.contract";
import type {IdentityGoogleIdentityRepository} from "../../logic/google-identity-repository";
type Row={id:string;email:string;name:string|null;emailVerified:Date|null;role:IdentityRole;establishedAt:Date;suspendedAt:Date|null;lifecycleState:IdentityLifecycleState};
const projection=`SELECT u."id",u."email",u."name",u."emailVerified",u."role",u."createdAt" AS "establishedAt",u."suspendedAt",u."lifecycleState" FROM "User" u`;
const toPrincipal=(r:Row):IdentityPrincipal=>({id:r.id,email:r.email,name:r.name,emailVerified:r.emailVerified,role:r.role,establishedAt:r.establishedAt,suspendedAt:r.suspendedAt,lifecycleState:r.lifecycleState});
export function createPostgresIdentityGoogleIdentityRepository(connectionString:string):IdentityGoogleIdentityRepository{
 const cs=connectionString.trim();if(!cs)throw new Error("Identity PostgreSQL connection string is required.");
 return Object.freeze({
  async bindSubject(userId,subject){
   const c=new Client({connectionString:cs});await c.connect();
   try{await c.query("BEGIN");
    const q=await c.query<{emailVerified:Date|null;suspendedAt:Date|null;lifecycleState:IdentityLifecycleState}>(`SELECT "emailVerified","suspendedAt","lifecycleState" FROM "User" WHERE "id"=$1 FOR UPDATE`,[userId]);
    const u=q.rows[0];if(!u){await c.query("ROLLBACK");return{status:"PRINCIPAL_NOT_FOUND" as const}}
    if(u.suspendedAt||u.lifecycleState!=="ACTIVE"){await c.query("ROLLBACK");return{status:"ACCOUNT_NOT_ACTIVE" as const}}
    if(!u.emailVerified){await c.query("ROLLBACK");return{status:"EMAIL_NOT_VERIFIED" as const}}
    const ins=await c.query(`INSERT INTO "GoogleIdentity"("userId","subject","updatedAt") VALUES($1,$2,NOW()) ON CONFLICT DO NOTHING`,[userId,subject]);
    if((ins.rowCount??0)===1){await c.query("COMMIT");return{status:"BOUND" as const}}
    const prior=await c.query<{userId:string;subject:string}>(`SELECT "userId","subject" FROM "GoogleIdentity" WHERE "userId"=$1 OR "subject"=$2 FOR UPDATE`,[userId,subject]);
    await c.query("COMMIT");
    if(prior.rows.some(x=>x.userId===userId&&x.subject===subject))return{status:"ALREADY_BOUND" as const};
    if(prior.rows.some(x=>x.subject===subject))return{status:"SUBJECT_ALREADY_BOUND" as const};
    return{status:"USER_ALREADY_BOUND" as const};
   }catch(e){await c.query("ROLLBACK").catch(()=>undefined);throw e}finally{await c.end()}
  },
  async findPrincipalBySubject(subject){
   const c=new Client({connectionString:cs});await c.connect();
   try{const q=await c.query<Row>(`${projection} JOIN "GoogleIdentity" g ON g."userId"=u."id" WHERE g."subject"=$1 LIMIT 1`,[subject]);return q.rows[0]?toPrincipal(q.rows[0]):null}
   finally{await c.end()}
  }
 })
}

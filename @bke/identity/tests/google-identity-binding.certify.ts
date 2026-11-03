import{randomUUID}from"node:crypto";import{Client}from"pg";
import{createPostgresIdentityGoogleIdentityRepository}from"../prisma/repositories/postgres-google-identity-repository";
import{createIdentityGooglePrincipalBindingCapability}from"../logic/google-identity";
const cs=process.env.DATABASE_URL?.trim();if(!cs)throw Error("DATABASE_URL is required for Google Identity certification.");
const c=new Client({connectionString:cs});await c.connect();const ids=[randomUUID(),randomUUID(),randomUUID(),randomUUID()];const now=new Date();
try{
 await c.query("BEGIN");for(let i=0;i<ids.length;i++)await c.query(`INSERT INTO "User"("id","email","name","emailVerified","role","updatedAt","lifecycleState","suspendedAt")VALUES($1,$2,'cert',$3,'CUSTOMER',$4,$5::"IdentityLifecycleState",$6)`,[ids[i],`${ids[i]}@identity-cert.example.invalid`,i===3?null:now,now,i===2?"SUSPENDED":"ACTIVE",i===2?now:null]);await c.query("COMMIT");
 const cap=createIdentityGooglePrincipalBindingCapability(createPostgresIdentityGoogleIdentityRepository(cs));const s=`google-${randomUUID()}`;
 const b=await cap.bindToUser({userId:ids[0]!,subject:s});if(b.status!=="BOUND")throw Error("first binding failed");
 const found=await cap.findPrincipalBySubject({subject:s});if(found.status!=="FOUND"||found.principal.id!==ids[0])throw Error("lookup did not preserve BKE id");
 if((await cap.bindToUser({userId:ids[0]!,subject:s})).status!=="ALREADY_BOUND")throw Error("repeat binding not idempotent");
 const sc=await cap.bindToUser({userId:ids[1]!,subject:s});if(sc.status!=="REJECTED"||sc.code!=="SUBJECT_ALREADY_BOUND")throw Error("subject collision accepted");
 const uc=await cap.bindToUser({userId:ids[0]!,subject:`google-${randomUUID()}`});if(uc.status!=="REJECTED"||uc.code!=="USER_ALREADY_BOUND")throw Error("second provider for user accepted");
 const inact=await cap.bindToUser({userId:ids[2]!,subject:`google-${randomUUID()}`});if(inact.status!=="REJECTED"||inact.code!=="ACCOUNT_NOT_ACTIVE")throw Error("inactive user bound");
 const unv=await cap.bindToUser({userId:ids[3]!,subject:`google-${randomUUID()}`});if(unv.status!=="REJECTED"||unv.code!=="EMAIL_NOT_VERIFIED")throw Error("unverified user bound");
 const concurrent=`google-${randomUUID()}`;const race=await Promise.all([cap.bindToUser({userId:ids[0]!,subject:concurrent}),cap.bindToUser({userId:ids[1]!,subject:concurrent})]);
 if(race.filter(x=>x.status==="BOUND").length!==1||race.filter(x=>x.status==="REJECTED"&&x.code==="SUBJECT_ALREADY_BOUND").length!==1)throw Error(`subject race unsafe ${JSON.stringify(race)}`);
 console.log("Google Identity binding PostgreSQL certification GREEN");
}finally{await c.query('DELETE FROM "User" WHERE "id"=ANY($1::text[])',[ids]).catch(()=>undefined);await c.end()}

// CANONICAL CROSS-LANGUAGE GOLDEN VECTORS. Public TEST-ONLY seed; never use for production.
const {createPrivateKey,createPublicKey,sign,createHash}=require('node:crypto');
const seed=Buffer.from('4242424242424242424242424242424242424242424242424242424242424242','hex');
const key=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),seed]),format:'der',type:'pkcs8'});
const publicKeyPem=createPublicKey(key).export({type:'spki',format:'pem'}).toString();
const b64=b=>b.toString('base64url');
const thumb=b64(createHash('sha256').update('BKE test fixture Agent public key').digest());
const base={schema:'bke.product-lease.v1',issuer:'BKE Digital Solutions',audience:'bke-product',leaseId:'vector-lease-001',accountId:'account-test',userId:'user-test',productId:'render-dock',agentSessionId:'agent-session-test',agentKeyThumbprint:thumb,keyProtection:'software',plan:'subscription',allowedActions:['OPEN'],issuedAt:'2026-11-11T00:00:00.000Z',refreshAfter:'2026-11-11T01:00:00.000Z',expiresAt:'2026-11-14T00:00:00.000Z'};
function token(claims=base,kid='test-ed25519-2026') {const head={alg:'EdDSA',kid,typ:'bke.product-lease.v1+jws'};const unsigned=b64(Buffer.from(JSON.stringify(head)))+'.'+b64(Buffer.from(JSON.stringify(claims)));return unsigned+'.'+b64(sign(null,Buffer.from(unsigned,'ascii'),key));}
const valid=token();
const vectors=[
 {name:'valid',jws:valid,accept:true},
 {name:'expired',jws:token({...base,issuedAt:'2026-11-01T00:00:00.000Z',refreshAfter:'2026-11-01T01:00:00.000Z',expiresAt:'2026-11-10T00:00:00.000Z'}),accept:false,reason:'EXPIRED'},
 {name:'wrong-product',jws:token({...base,productId:'air-stack'}),accept:false,reason:'CLAIM_MISMATCH'},
 {name:'wrong-thumbprint',jws:token({...base,agentKeyThumbprint:b64(createHash('sha256').update('another test key').digest())}),accept:false,reason:'CLAIM_MISMATCH'},
 {name:'unknown-kid',jws:token(base,'unknown-2026'),accept:false,reason:'UNTRUSTED_KID'},
 {name:'retired-kid',jws:token(base,'test-retired-2025'),accept:false,reason:'UNTRUSTED_KID'},
 {name:'tampered-byte',jws:valid.slice(0,-1)+(valid.at(-1)==='A'?'B':'A'),accept:false,reason:'INVALID_SIGNATURE'},
 {name:'future-issued',jws:token({...base,issuedAt:'2026-11-12T00:00:00.000Z',refreshAfter:'2026-11-12T01:00:00.000Z',expiresAt:'2026-11-15T00:00:00.000Z'}),accept:false,reason:'FUTURE_ISSUED_AT'},
 {name:'wrong-alg-header',jws:valid.replace(/^([^.]+)/,b64(Buffer.from(JSON.stringify({alg:'HS256',kid:'test-ed25519-2026',typ:'bke.product-lease.v1+jws'})))),accept:false,reason:'MALFORMED_JWS'},
];
const out={schema:'bke.lease-vectors.v1',description:'SYNTHETIC PUBLIC TEST KEY ONLY. NO PRODUCTION KEY.',libraryContract:'bke.product-lease.v1',now:'2026-11-11T02:00:00.000Z',publicKeyPem,activeKid:'test-ed25519-2026',retiredKid:'test-retired-2025',expected:{issuer:base.issuer,audience:base.audience,accountId:base.accountId,userId:base.userId,productId:base.productId,agentSessionId:base.agentSessionId,agentKeyThumbprint:thumb,action:'OPEN'},vectors};
console.log(JSON.stringify(out,null,2));

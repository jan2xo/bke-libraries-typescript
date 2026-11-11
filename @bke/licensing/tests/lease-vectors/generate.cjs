// CANONICAL CROSS-LANGUAGE GOLDEN VECTORS. Public TEST-ONLY seed; never use for production.
const {createPrivateKey,createPublicKey,sign,createHash}=require('node:crypto');
const seed=Buffer.from('4242424242424242424242424242424242424242424242424242424242424242','hex');
const key=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),seed]),format:'der',type:'pkcs8'});
const publicKeyPem=createPublicKey(key).export({type:'spki',format:'pem'}).toString();
const b64=b=>b.toString('base64url');
const thumb=b64(createHash('sha256').update('BKE test fixture Agent public key').digest());
const base={schema:'bke.product-lease.v1',issuer:'BKE Digital Solutions',audience:'bke-product',leaseId:'vector-lease-001',accountId:'account-test',userId:'user-test',productId:'render-dock',agentSessionId:'agent-session-test',agentKeyThumbprint:thumb,keyProtection:'software',plan:'subscription',allowedActions:['OPEN'],issuedAt:'2026-11-11T00:00:00.000Z',refreshAfter:'2026-11-11T01:00:00.000Z',expiresAt:'2026-11-14T00:00:00.000Z'};
function rawToken(headerJson,payloadJson) {const unsigned=b64(Buffer.from(headerJson))+'.'+b64(Buffer.isBuffer(payloadJson)?payloadJson:Buffer.from(payloadJson));return unsigned+'.'+b64(sign(null,Buffer.from(unsigned,'ascii'),key));}
function token(claims=base,kid='test-ed25519-2026') {return rawToken(JSON.stringify({alg:'EdDSA',kid,typ:'bke.product-lease.v1+jws'}),JSON.stringify(claims));}
const valid=token();
const duplicateHeader='{"alg":"HS256","alg":"EdDSA","kid":"test-ed25519-2026","typ":"bke.product-lease.v1+jws"}';
const duplicatePayload=JSON.stringify(base).replace('"productId":"render-dock"','"product\\u0049d":"air-stack","productId":"render-dock"');
const invalidUtf8Payload=Buffer.from(JSON.stringify(base),'utf8');
invalidUtf8Payload[invalidUtf8Payload.indexOf('vector-lease-001')]=0xff;
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
 {name:'duplicate-header',jws:rawToken(duplicateHeader,JSON.stringify(base)),accept:false,reason:'MALFORMED_JWS'},
 {name:'duplicate-payload',jws:rawToken(JSON.stringify({alg:'EdDSA',kid:'test-ed25519-2026',typ:'bke.product-lease.v1+jws'}),duplicatePayload),accept:false,reason:'INVALID_CLAIMS'},
 {name:'invalid-utf8-payload',jws:rawToken(JSON.stringify({alg:'EdDSA',kid:'test-ed25519-2026',typ:'bke.product-lease.v1+jws'}),invalidUtf8Payload),accept:false,reason:'INVALID_CLAIMS'},
 {name:'bom-header',jws:rawToken(Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(JSON.stringify({alg:'EdDSA',kid:'test-ed25519-2026',typ:'bke.product-lease.v1+jws'}))]),JSON.stringify(base)),accept:false,reason:'MALFORMED_JWS'},
 {name:'bom-payload',jws:rawToken(JSON.stringify({alg:'EdDSA',kid:'test-ed25519-2026',typ:'bke.product-lease.v1+jws'}),Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(JSON.stringify(base))])),accept:false,reason:'INVALID_CLAIMS'},
];
const out={schema:'bke.lease-vectors.v1',description:'SYNTHETIC PUBLIC TEST KEY ONLY. NO PRODUCTION KEY.',libraryContract:'bke.product-lease.v1',now:'2026-11-11T02:00:00.000Z',publicKeyPem,activeKid:'test-ed25519-2026',retiredKid:'test-retired-2025',expected:{issuer:base.issuer,audience:base.audience,accountId:base.accountId,userId:base.userId,productId:base.productId,agentSessionId:base.agentSessionId,agentKeyThumbprint:thumb,action:'OPEN'},vectors};
console.log(JSON.stringify(out,null,2));

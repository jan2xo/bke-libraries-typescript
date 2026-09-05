import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const forbidden = ["@/", "server-only", "generated/prisma", "@bke/identity", "@bke/licensing", "@bke/commerce", "@bke/accounts"];
async function files(path:string):Promise<string[]>{ const entries=await readdir(path,{withFileTypes:true}); const out:string[]=[]; for(const entry of entries){ if(entry.name==="tests"||entry.name==="docs"||entry.name==="node_modules") continue; const full=join(path,entry.name); if(entry.isDirectory()) out.push(...await files(full)); else if(entry.name.endsWith(".ts")) out.push(full); } return out; }
for(const file of await files(root)){ const source=await readFile(file,"utf8"); for(const token of forbidden){ if(source.includes(token)) throw new Error(`${file} reaches through forbidden boundary: ${token}`); } }
for(const required of ["contracts","logic","prisma","migrations"]){ await readdir(join(root,required)); }
console.log("Support extraction boundary GREEN");

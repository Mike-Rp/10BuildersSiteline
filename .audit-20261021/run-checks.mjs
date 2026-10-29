import fs from "node:fs";
import {spawn} from "node:child_process";
const root=new URL("../",import.meta.url),dir=new URL("./",import.meta.url);
const redact=s=>s.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,"[TOKEN MASKED]").replace(/(?:Password@123|ChangedPass@456)/g,"[TEST PASSWORD MASKED]");
const env={...process.env,DB_SERVER:"127.0.0.1",DB_PORT:"9",DB_NAME:"audit_local_only",DB_USER:"audit_local_only",DB_PASSWORD:"local-only-unused",JWT_SECRET:"audit-local-only-no-hosted-access-0123456789",PGSSLMODE:"disable",API_URL:"/api/v1",ARCHIVE_MAINTENANCE_ENABLED:"false"};
async function run(name,command,args){
 const start=performance.now();let output="";
 const child=spawn(command,args,{cwd:root,env,shell:false});
 child.stdout.on("data",d=>output+=d);child.stderr.on("data",d=>output+=d);
 child.on("error",e=>output+=e.message);
 const code=await new Promise(r=>child.on("close",r));
 fs.writeFileSync(new URL(name+".log",dir),redact(output));
 console.log(JSON.stringify({name,exit:code,ms:Math.round(performance.now()-start),tail:redact(output).split("\n").slice(-12)}));
}
const choice=process.argv[2];
if(choice==="frontend")await run("frontend-tests",process.execPath,["--experimental-strip-types","--test",...fs.readdirSync(new URL("tests/",root)).filter(p=>p.endsWith(".test.mjs")).map(p=>"tests/"+p)]);
if(choice==="backend")await run("backend-tests",process.execPath,["--experimental-test-module-mocks","--test",...fs.readdirSync(new URL("Thesis-Backend/tests/",root)).filter(p=>p.endsWith(".test.js")).map(p=>"Thesis-Backend/tests/"+p)]);
if(choice==="ui")await run("ui-tests",process.execPath,["--experimental-strip-types","tests/ui-smoke.mjs"]);
if(choice==="types")await run("types",process.execPath,["node_modules/typescript/bin/tsc","--noEmit"]);
if(choice==="build")await run("build","cmd.exe",["/d","/s","/c","pnpm build"]);

if(choice==="probes")await run("probes",process.execPath,["--experimental-strip-types","--test",".audit-20261021/probes.mjs"]);
if(choice==="npm-build")await run("npm-build",process.execPath,["node_modules/vite/bin/vite.js","build"]);

if(choice==="scope-browser")await run("scope-browser",process.execPath,["--experimental-strip-types",".audit-20261021/scope-browser.mjs"]);

if(choice==="alternates")await run("alternates",process.execPath,["--experimental-strip-types","--test",".audit-20261021/alternates.mjs"]);

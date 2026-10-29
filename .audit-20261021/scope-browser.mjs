import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {PGlite} from "@electric-sql/pglite";
import {citext} from "@electric-sql/pglite/contrib/citext";
import {PGLiteSocketServer} from "@electric-sql/pglite-socket";
const root=process.cwd(),scratch=path.join(root,".audit-20261021");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const free=()=>new Promise(r=>{const s=net.createServer().listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>r(p));});});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,ms=30000)=>{const end=Date.now()+ms;for(;;){try{if(await fn())return;}catch{}if(Date.now()>end)throw Error("Local audit wait timed out");await sleep(100);}};
const db=new PGlite({extensions:{citext}});let pg,backend,vite,chrome;
const results={scope:{accounts:0,roles:{},mismatches:[],unexpectedLogins:[]},metrics:[],browser:{},rls:[],seed:{}};
const password=String.fromCharCode(80,97,115,115,119,111,114,100,64,49,50,51);
try{
 await db.exec("create role authenticated;create role anon;create role service_role;create schema extensions;create schema auth;create schema storage;");
 await db.exec(read("supabase/migrations/20261017000002_thesis_backend_schema.sql").replace(/^create extension if not exists pgcrypto.*$/m,""));
 await db.exec(read("Thesis-Backend/migrations/003-react-integration.sql"));
 await db.exec(read("supabase/seed/bulk-test-data.sql"));
 await db.exec(read("Thesis-Backend/migrations/004-project-type-workflows.sql"));
 // One isolated declined-only account checks that a historical refusal grants no project access.
 await db.exec(`insert into users(id,full_name,email,password_hash,role_id,status)
 select 'dddddddd-dddd-4ddd-8ddd-dddddddddddd','Audit declined-only SPM','declined-only@audit.invalid',password_hash,3,'active'
 from users limit 1;
 insert into project_phase_team(project_id,project_stage_id,spm_user_id,status)
 select id,1,'dddddddd-dddd-4ddd-8ddd-dddddddddddd','declined' from projects where lifecycle_status='active' limit 1
 on conflict(project_id,project_stage_id) do update set spm_user_id=excluded.spm_user_id,status='declined';`);
 results.rls=(await db.query("select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by relname")).rows;
 results.seed={projects:(await db.query("select count(*)::int as n,count(*) filter(where target_end_date is null)::int as missing_end_dates,count(distinct target_start_date)::int as distinct_starts from projects")).rows[0],
 licenses:(await db.query("select count(*) filter(where license_expiry<current_date and superseded_at is null)::int as expired_current from user_licenses")).rows[0],
 unconfiguredPhases:(await db.query("select t.code as type,s.code from project_type_stages w join project_types t on t.id=w.project_type_id join project_stages s on s.id=w.project_stage_id where not exists(select 1 from phase_checklist_templates c where c.project_stage_id=s.id and required) order by t.code,w.sort_order")).rows};
 const dbPort=await free(),apiPort=await free();pg=new PGLiteSocketServer({db,port:dbPort,host:"127.0.0.1"});await pg.start();
 const secret="audit-isolated-local-key-0123456789";
 backend=spawn(process.execPath,["src/index.js"],{cwd:path.join(root,"Thesis-Backend"),windowsHide:true,stdio:"ignore",env:{...process.env,NODE_ENV:"development",DB_SERVER:"127.0.0.1",DB_PORT:String(dbPort),DB_NAME:"postgres",DB_USER:"postgres",DB_PASSWORD:"local-test",DB_POOL_MAX:"1",PGSSLMODE:"disable",JWT_SECRET:secret,API_URL:"/api/v1",PORT:String(apiPort),HOST:"127.0.0.1",ARCHIVE_MAINTENANCE_ENABLED:"false"}});
 const base="http://127.0.0.1:"+apiPort+"/api/v1";
 await until(async()=> (await fetch(base+"/health")).ok);
 const request=async(route,token,body)=>{
  const start=performance.now(),headers=token?{Authorization:"Bearer "+token}:{};
  if(body)headers["Content-Type"]="application/json";
  const response=await fetch(base+route,{method:body?"POST":"GET",headers,body:body?JSON.stringify(body):undefined});
  const text=await response.text();let value;try{value=JSON.parse(text);}catch{value={};}
  return {status:response.status,data:value.data,ms:Number((performance.now()-start).toFixed(2)),bytes:Buffer.byteLength(text)};
 };
 const users=(await db.query("select u.id,u.email,u.status,r.code as role from users u join roles r on r.id=u.role_id order by r.code,u.email")).rows;
 const allProjects=(await db.query("select id,lifecycle_status from projects where not coalesce(is_deleted,false)")).rows;
 const files=(await db.query("select f.id,f.project_id from stored_files f where project_id is not null and purpose='document'")).rows;
 for(const [index,user] of users.entries()){
  results.scope.accounts++;results.scope.roles[user.role]=(results.scope.roles[user.role]||0)+1;
  const signed=await request("/auth/login",null,{email:user.email,password});
  if(signed.status!==200){if(["active","invited"].includes(user.status))results.scope.unexpectedLogins.push({account:index,role:user.role,status:signed.status});continue;}
  const expected=(await db.query(`select p.id from projects p where not coalesce(p.is_deleted,false) and
   ($1='admin' or ($1='opm' and(p.suggested_opm_id=$2 or exists(select 1 from project_engineers e where e.project_id=p.id and e.user_id=$2 and e.unassigned_at is null)))
    or ($1='spm' and(exists(select 1 from project_phase_team t where t.project_id=p.id and t.spm_user_id=$2 and t.status in('pending','confirmed')) or exists(select 1 from project_engineers e where e.project_id=p.id and e.user_id=$2 and e.unassigned_at is null)))
    or ($1='client' and p.lifecycle_status in('active','archived') and exists(select 1 from user_client_project_links l where l.project_id=p.id and l.user_id=$2)))`,[user.role,user.id])).rows.map(p=>p.id).sort();
  const loaded=await request("/workspace/project-data",signed.data.token);
  const actual=(loaded.data||[]).map(p=>p.list.id).sort();
  results.metrics.push({role:user.role,status:loaded.status,ms:loaded.ms,bytes:loaded.bytes,projects:actual.length});
  if(loaded.status!==200||JSON.stringify(actual)!==JSON.stringify(expected))results.scope.mismatches.push({account:index,role:user.role,kind:"workspace",expected:expected.length,actual:actual.length,status:loaded.status,declinedOnly:user.email==="declined-only@audit.invalid"});
  const outside=allProjects.find(p=>!expected.includes(p.id));
  if(outside){const r=await request("/projects/"+outside.id,signed.data.token);if(![403,404].includes(r.status))results.scope.mismatches.push({account:index,role:user.role,kind:"outside-project",status:r.status});}
  const outsideFile=files.find(f=>!expected.includes(f.project_id));
  if(outsideFile){const r=await request("/files/"+outsideFile.id+"/content",signed.data.token);if(![403,404].includes(r.status))results.scope.mismatches.push({account:index,role:user.role,kind:"outside-file",status:r.status});}
 }
 console.log("Scope sweep complete: "+results.scope.accounts+" accounts; mismatches="+results.scope.mismatches.length);
 // Mount the unchanged app in a real browser, entirely against this local stack.
 process.env.VITE_API_URL=base;process.env.NODE_ENV="development";
 const {createServer}=await import("vite"),webPort=await free();
 vite=await createServer({root,cacheDir:path.join(scratch,"vite-cache"),logLevel:"silent",server:{port:webPort,host:"127.0.0.1",strictPort:true,watch:{ignored:["**/.audit-20261021/**"]}}});await vite.listen();
 const chromePath="C:/Program Files/Google/Chrome/Application/chrome.exe",debugPort=await free();
 if(!fs.existsSync(chromePath)){results.browser={notRun:"Chrome executable not available"};}
 else {
  chrome=spawn(chromePath,["--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check","--disable-background-networking","--disable-component-update","--disable-extensions","--no-proxy-server","--remote-debugging-port="+debugPort,"--user-data-dir="+path.join(scratch,"chrome-profile"),"about:blank"],{windowsHide:true,stdio:"ignore"});
  await until(async()=> (await fetch("http://127.0.0.1:"+debugPort+"/json/list")).ok);
  const targets=await(await fetch("http://127.0.0.1:"+debugPort+"/json/list")).json();
  const socket=new WebSocket(targets.find(t=>t.type==="page").webSocketDebuggerUrl);await once(socket,"open");
  let next=1;const pending=new Map();
  socket.onmessage=e=>{const m=JSON.parse(String(e.data));if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=next++;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result?.value;};
  await send("Page.enable");await send("Network.enable");await send("Network.setBlockedURLs",{urls:["https://*","*supabase*","*vercel.app*"]});
  const url="http://127.0.0.1:"+webPort;
  const signIn=async(email)=>{
   await send("Page.navigate",{url});await until(()=>evaluate("!!document.querySelector('form.login-form')"),30000);
   await evaluate(`(()=>{const form=document.querySelector('form.login-form'),inputs=form.querySelectorAll('input'),setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(inputs[0],${JSON.stringify(email)});inputs[0].dispatchEvent(new Event('input',{bubbles:true}));setter.call(inputs[1],${JSON.stringify(password)});inputs[1].dispatchEvent(new Event('input',{bubbles:true}));})()`);
   await sleep(50);await evaluate("document.querySelector('form.login-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
   await until(()=>evaluate("!document.querySelector('form.login-form') && !!document.querySelector('.sidebar')"),40000);
   await sleep(300);
   await evaluate("[...document.querySelectorAll('.sidebar button,.sidebar a')].find(e=>e.textContent.trim().startsWith('Active sites'))?.click()");
   await sleep(400);
  };
  await send("Emulation.setDeviceMetricsOverride",{width:1366,height:900,deviceScaleFactor:1,mobile:false});
  await signIn("admin001@siteline-test.example");
  const sample=()=>evaluate(`(()=>{const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'};const small=[...document.querySelectorAll('#root *')].filter(e=>!e.children.length&&e.textContent.trim()&&visible(e)&&parseFloat(getComputedStyle(e).fontSize)<14).map(e=>({tag:e.tagName,cls:e.className,font:getComputedStyle(e).fontSize,text:e.textContent.trim().slice(0,38)}));const touch=[...document.querySelectorAll('#root button,#root select,#root input,#root a')].filter(visible).map(e=>({label:(e.getAttribute('aria-label')||e.textContent||e.getAttribute('type')||e.tagName).trim().slice(0,38),width:Math.round(e.getBoundingClientRect().width),height:Math.round(e.getBoundingClientRect().height)})).filter(r=>r.width<48||r.height<48);return {smallTextCount:small.length,smallTextExamples:small.slice(0,10),undersizedTargets:touch.length,targetExamples:touch.slice(0,10),horizontalOverflow:document.documentElement.scrollWidth>innerWidth,connectedIndicator:document.body.textContent.includes('Connected to database')}})()`);
  results.browser.admin=await sample();
  const shot=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});fs.writeFileSync(path.join(scratch,"admin-active-sites.png"),Buffer.from(shot.data,"base64"));
  await evaluate("sessionStorage.clear();localStorage.clear()");await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await signIn("spm001@siteline-test.example");
  results.browser.spm=await sample();
  // Stop only the backend created by this script, leaving the user's running system untouched.
  const exit=once(backend,"exit");backend.kill();await exit;backend=undefined;
  await send("Page.reload");await sleep(1800);
  results.browser.outageRestore=await evaluate("({text:document.body.textContent.trim().slice(0,600),retry:[...document.querySelectorAll('button')].some(b=>/retry|try again/i.test(b.textContent)),skeleton:!!document.querySelector('.workspace-skeleton')})");
  const shot2=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});fs.writeFileSync(path.join(scratch,"backend-offline.png"),Buffer.from(shot2.data,"base64"));
  socket.close();
 }
}catch(error){results.error=error.message;console.log("AUDIT scope/browser error: "+error.message);}
finally{
 if(chrome)chrome.kill();if(vite)await vite.close();if(backend)backend.kill();if(pg)await pg.stop();await db.close();
 fs.writeFileSync(path.join(scratch,"scope-browser-results.json"),JSON.stringify(results,null,2));
 console.log(JSON.stringify({accounts:results.scope.accounts,roles:results.scope.roles,mismatches:results.scope.mismatches.length,unexpectedLogins:results.scope.unexpectedLogins.length,browser:results.browser,error:results.error}));
}

import assert from "node:assert/strict"
import test from "node:test"
import fs from "node:fs"
import net from "node:net"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { PGlite } from "@electric-sql/pglite"
import { citext } from "@electric-sql/pglite/contrib/citext"
import { PGLiteSocketServer } from "@electric-sql/pglite-socket"

const here=path=>fileURLToPath(new URL(path,import.meta.url))
const port=()=>new Promise(resolve=>{const server=net.createServer().listen(0,"127.0.0.1",()=>{const value=server.address().port;server.close(()=>resolve(value))})})

test("login portals enforce database roles before creating or replacing sessions, including forged requests",{timeout:60000},async t=>{
  const db=new PGlite({extensions:{citext}})
  let socket,child
  t.after(async()=>{if(child){const closed=new Promise(resolve=>child.once('exit',resolve));child.kill();await closed}if(socket)await socket.stop();await db.close()})
  await db.exec("create role authenticated;create role anon;create role service_role;create schema extensions;create schema auth;create schema storage;")
  await db.exec(fs.readFileSync(here('../supabase/migrations/20261017000002_thesis_backend_schema.sql'),'utf8').replace(/^create extension if not exists pgcrypto.*$/m,''))
  for(const file of ['001-phase-checklists.sql','002-phase-update-confirmation.sql','003-react-integration.sql','004-verified-activity-progress.sql','009-engineer-license-workflow.sql'])await db.exec(fs.readFileSync(here('../Thesis-Backend/migrations/'+file),'utf8'))
  await db.exec(fs.readFileSync(here('../supabase/seed/dummy-data.sql'),'utf8'))
  // The session middleware reads engineer-credential columns (migration 015).
  await db.exec(fs.readFileSync(here('../Thesis-Backend/migrations/015-engineer-credentials.sql'),'utf8'))
  // Keep this routing/authentication fixture independent of seeded license dates.
  await db.exec("update user_licenses set license_expiry=current_date+400 where superseded_at is null; delete from license_renewal_requests where file_ref like 'seed/licenses/renewal-%'")
  const dbPort=await port(),apiPort=await port()
  socket=new PGLiteSocketServer({db,port:dbPort,host:'127.0.0.1'});await socket.start()
  child=spawn(process.execPath,['src/index.js'],{cwd:here('../Thesis-Backend/'),env:{...process.env,NODE_ENV:'development',DB_SERVER:'127.0.0.1',DB_PORT:String(dbPort),DB_NAME:'postgres',DB_USER:'postgres',DB_PASSWORD:'x',DB_POOL_MAX:'1',PGSSLMODE:'disable',JWT_SECRET:'isolated-login-portals-test-secret-0123456789',HOST:'127.0.0.1',PORT:String(apiPort),ARCHIVE_MAINTENANCE_ENABLED:'false',CORS_ORIGINS:'https://10buildline.site,https://staff.10buildline.site'},stdio:'ignore'})
  const base=`http://127.0.0.1:${apiPort}/api/v1`
  const deadline=Date.now()+20000
  while(true){try{if((await fetch(base+'/health')).ok)break}catch{}if(Date.now()>deadline)throw Error('Test API did not start');await new Promise(resolve=>setTimeout(resolve,100))}
  for (const origin of ['https://10buildline.site','https://staff.10buildline.site']) {
    const preflight=await fetch(base+'/auth/me',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization'}})
    assert.equal(preflight.status,204)
    assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin)
    assert.match(preflight.headers.get('Access-Control-Allow-Headers'),/authorization/i)
    assert.equal((await fetch(base+'/auth/me',{headers:{Origin:origin}})).status,401,'An allowed origin is not authorization')
  }
  const deniedOrigin=await fetch(base+'/auth/me',{method:'OPTIONS',headers:{Origin:'https://untrusted.example','Access-Control-Request-Method':'GET'}})
  assert.equal(deniedOrigin.headers.get('Access-Control-Allow-Origin'),null)
  const post=async(path,body)=>{const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return{response,body:await response.json()}}
  const accounts=(await db.query("select u.id,u.email,r.code as role from users u join roles r on r.id=u.role_id where u.status='active' and not coalesce(u.is_deleted,false) order by u.id")).rows
  for(const role of ['admin','opm','spm','client']){
    const user=accounts.find(account=>account.role===role)
    assert.ok(user,role)
    const path=role==='admin'?'/auth/admin/login':role==='client'?'/auth/login':'/auth/staff/login'
    const credentials={email:user.email,password:'Password@123',replace_session:true}
    const accepted=await post(path,credentials)
    assert.equal(accepted.response.status,200,JSON.stringify(accepted.body))
    assert.equal(accepted.body.data.user.role,role)
    assert.equal(accepted.response.headers.get('Set-Cookie'),null,'Authentication continues to use bearer tokens, not domain cookies')
    const authHeaders={Authorization:'Bearer '+accepted.body.data.token,Origin:role==='client'?'https://10buildline.site':'https://staff.10buildline.site'}
    const me=await fetch(base+'/auth/me',{headers:authHeaders})
    assert.equal(me.status,200)
    assert.equal((await me.json()).data.role,role)
    assert.equal(me.headers.get('Access-Control-Allow-Origin'),authHeaders.Origin)
    const before=(await db.query('select u.last_login_at,t.token from users u join users_token t on t.user_id=u.id where u.id=$1',[user.id])).rows[0]
    for(const wrongPath of ['/auth/login','/auth/staff/login','/auth/admin/login'].filter(value=>value!==path)){
      const rejected=await post(wrongPath,{...credentials,role:role==='admin'?'opm':'admin',portal:role==='admin'?'staff':'admin'})
      assert.equal(rejected.response.status,403)
      assert.equal(rejected.body.error.code,'LOGIN_PORTAL_MISMATCH')
      assert.equal(rejected.body.data?.token,undefined)
      const after=(await db.query('select u.last_login_at,t.token from users u join users_token t on t.user_id=u.id where u.id=$1',[user.id])).rows[0]
      assert.deepEqual(after,before,'A wrong portal must not update login timestamps or replace a valid session')
    }
    if(role!=='admin'){
      const protectedPage=await fetch(base+'/accounts/password-reset-requests',{headers:{Authorization:'Bearer '+accepted.body.data.token}})
      assert.equal(protectedPage.status,403,'Signing in as staff or client never grants admin API permissions')
    }
    assert.equal((await fetch(base+'/auth',{method:'DELETE',headers:authHeaders})).status,200,'Logout revokes the server session')
    assert.equal((await fetch(base+'/auth/me',{headers:authHeaders})).status,401,'Logged-out tokens cannot restore a session')
  }
  const admin=accounts.find(account=>account.role==='admin')
  assert.equal((await post('/auth',{email:admin.email,password:'Password@123',replace_session:true,role:'opm'})).response.status,403,'Legacy public sign-in cannot bypass portal restrictions')
  const wrong=await post('/auth/staff/login',{email:admin.email,password:'incorrect-password'})
  assert.equal(wrong.response.status,401)
  assert.match(wrong.body.error.message,/Invalid credentials/)
  for(const path of ['/auth/login','/auth/staff/login','/auth/admin/login']){
    const limited=await post(path,{email:admin.email,password:'incorrect-password'})
    assert.equal(limited.response.status,429,'All portals share the failed-login limit')
    assert.ok(limited.response.headers.get('Retry-After'))
  }
})

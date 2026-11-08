import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import {once} from 'node:events'
import {chromePath,launchChrome} from './chrome.mjs'

// Opt-in: npm run build, then node --experimental-strip-types --test tests/browser/login-back.mjs
// Both production hostnames are mapped to a loopback fixture, using an isolated
// browser profile. This does not test or change production DNS or live accounts.
test('native Chrome Back confirmation: all roles, desktop/mobile viewports, cancellation, logout and ordinary Back', {skip:!chromePath,timeout:120000},async t=>{
  const dist=path.resolve('dist')
  let user,revoked=false,logoutCalls=0
  const server=http.createServer(async(req,res)=>{
    const pathname=new URL(req.url,'http://local.test').pathname
    if(pathname.startsWith('/api/v1/')) {
      res.setHeader('Content-Type','application/json')
      res.setHeader('Cache-Control','no-store')
      const route=pathname.slice('/api/v1'.length)
      if(['/auth/login','/auth/admin/login','/auth/staff/login'].includes(route)) {
        const expected=user.role==='client'?'/auth/login':user.role==='admin'?'/auth/admin/login':'/auth/staff/login'
        if(route!==expected){res.statusCode=403;return res.end(JSON.stringify({error:{message:'Wrong login portal'}}))}
        revoked=false
        const token=`test.${Buffer.from(JSON.stringify({sub:user.id,details:{id:user.id,role:user.role}})).toString('base64url')}.test`
        return res.end(JSON.stringify({user,token}))
      }
      if(route==='/auth'&&req.method==='DELETE'){revoked=true;logoutCalls++;return res.end(JSON.stringify({ok:true}))}
      if(revoked){res.statusCode=401;return res.end(JSON.stringify({error:{message:'Session ended'}}))}
      if(route==='/auth/me'||route===`/accounts/${user.id}`)return res.end(JSON.stringify(user))
      if(route==='/accounts')return res.end(JSON.stringify([user]))
      if(route==='/workspace')return res.end(JSON.stringify({accounts:{},projects:{},preferences:{}}))
      if(['/auth/session','/auth/activity'].includes(route)){const now=Date.now();return res.end(JSON.stringify({lastActivityAt:now,expiresAt:now+1800000,warningAt:now+1500000,serverNow:now}))}
      return res.end('[]')
    }
    let file=path.resolve(dist,'.'+decodeURIComponent(pathname))
    if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())file=path.join(dist,'index.html')
    const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'}
    res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream')
    res.end(fs.readFileSync(file))
  })
  server.listen(0,'127.0.0.1');await once(server,'listening')
  const port=server.address().port
  const browser=await launchChrome([
    '--host-resolver-rules=MAP 10buildline.site 127.0.0.1, MAP staff.10buildline.site 127.0.0.1',
    `--unsafely-treat-insecure-origin-as-secure=http://10buildline.site:${port},http://staff.10buildline.site:${port}`,
  ])
  t.after(async()=>{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))})
  for(const mobile of [false,true])for(const role of ['client','admin','opm','spm']) {
    await t.test(`${role}, ${mobile?'mobile viewport':'desktop'}`,async subtest=>{
      user={id:`browser-${role}`,role,full_name:`Browser ${role}`,email:`${role}@example.test`,status:'active',date_added:'2026-01-01',temp_password_issued:false}
      revoked=false
      const page=await browser.page()
      subtest.after(()=>page.call('Page.close').catch(()=>{}))
      await page.call('Emulation.setDeviceMetricsOverride',{width:mobile?390:1366,height:mobile?844:900,deviceScaleFactor:1,mobile})
      const host=role==='client'?'10buildline.site':'staff.10buildline.site'
      const origin=`http://${host}:${port}`
      const dashboard=`/${role}/${role==='client'?'overview':'dashboard'}`
      await page.call('Page.navigate',{url:origin+'/'})
      await page.wait('!!document.querySelector("form.login-form")')
      const olderHistory=await page.call('Page.getNavigationHistory')
      const olderLoginId=olderHistory.entries[olderHistory.currentIndex].id
      await page.call('Page.navigate',{url:origin+'/?login=again'})
      await page.wait('!!document.querySelector("form.login-form")')
      const ready=`location.pathname===${JSON.stringify(dashboard)}&&!!document.querySelector('.sidebar [aria-label="Sign out"]')&&!document.querySelector('.workspace-skeleton')`
      const signIn=async()=>{
        if(role==='admin')await page.click('[aria-label="Administrator sign-in"]')
        await page.evaluate(`(()=>{const inputs=document.querySelectorAll('form.login-form input');for(const [input,value] of [[inputs[0],${JSON.stringify(user.email)}],[inputs[1],'Password@123']]){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))}})()`)
        await page.click('.login-submit')
      }
      await signIn()
      await page.wait(ready)
      const initial=await page.call('Page.getNavigationHistory')
      const beforeLogout=logoutCalls
      await page.evaluate("window.__beforeBack=document.querySelector('.main-content'); void 0")
      await page.back()
      await page.wait('!!document.querySelector(\'[role="dialog"][aria-label="Are you sure you want to log out?"]\')')
      assert.equal(await page.evaluate('location.pathname'),dashboard)
      assert.equal(await page.evaluate('location.hostname'),host)
      assert.equal(await page.evaluate('!!document.querySelector("form.login-form")'),false)
      assert.equal((await page.call('Page.getNavigationHistory')).currentIndex,initial.currentIndex,'Back was canceled before committing history')
      assert.equal(logoutCalls,beforeLogout)
      await page.click('[role="dialog"] .modal-actions button:first-child')
      await page.wait('!document.querySelector("[role=dialog]")')
      assert.equal(await page.evaluate('!!sessionStorage.getItem("siteline-api-token")'),true)
      assert.equal(await page.evaluate("window.__beforeBack===document.querySelector('.main-content')"),true,'Cancel preserves the dashboard DOM')
      if(mobile)await page.click('.sidebar-toggle, .mobile-menu')
      await page.click('.sidebar [aria-label="Active sites"]')
      await page.wait(`location.pathname==='/${role}/active-sites'`)
      await page.back()
      await page.wait(ready)
      assert.equal(await page.evaluate('!!document.querySelector("[role=dialog]")'),false,'Ordinary module Back has no logout modal')
      await page.back()
      await page.wait('!!document.querySelector("[role=dialog]")')
      await page.click('[role="dialog"] .modal-actions button:last-child')
      await page.wait('location.pathname==="/"&&!!document.querySelector("form.login-form")')
      assert.equal(logoutCalls,beforeLogout+1)
      assert.equal(await page.evaluate('!!sessionStorage.getItem("siteline-api-token")'),false)
      await page.forward()
      await page.wait('location.pathname==="/"&&!!document.querySelector("form.login-form")')
      await page.back()
      await page.wait('location.pathname==="/"&&!!document.querySelector("form.login-form")')
      assert.equal(await page.evaluate('!!document.querySelector(".sidebar")'),false)
      assert.equal(await page.evaluate('location.hostname'),host)
      assert.equal((await page.call('Page.getNavigationHistory')).entries.length,initial.entries.length+1,'Only the real module navigation added history')
      await signIn()
      await page.wait(ready)
      await page.call('Page.addScriptToEvaluateOnNewDocument',{source:"window.__loginFormSeen=false;new MutationObserver(()=>{if(document.querySelector('form.login-form'))window.__loginFormSeen=true}).observe(document,{childList:true,subtree:true})"})
      await page.call('Page.reload')
      await page.wait(ready)
      assert.equal(await page.evaluate('window.__loginFormSeen'),false,'Refresh verifies the session without showing login')
      await page.call('Page.navigate',{url:origin+(role==='client'?'/client/login':'/admin/login')})
      await page.wait(ready)
      assert.equal(await page.evaluate('window.__loginFormSeen'),false,'Direct login visits never render credentials for an authenticated user')
      assert.equal(await page.evaluate('location.hostname'),host)
      assert.equal(logoutCalls,beforeLogout+1,'Refresh and manual login visits preserve the session')
      await page.call('Page.navigateToHistoryEntry',{entryId:olderLoginId})
      await page.wait(ready)
      assert.equal(await page.evaluate('!!document.querySelector("form.login-form")'),false,'An older cached login document restores the active session')
      if(mobile)await page.click('.sidebar-toggle, .mobile-menu')
      await page.click('[aria-label="Sign out"]')
      await page.wait('!!document.querySelector("[role=dialog]")')
      await page.click('[role="dialog"] .modal-actions button:last-child')
      await page.wait('location.pathname==="/"&&!!document.querySelector("form.login-form")')
      await page.forward()
      await page.wait('location.pathname==="/"&&!!document.querySelector("form.login-form")')
      assert.equal(await page.evaluate('!!document.querySelector(".sidebar")'),false,'Cached protected documents are rechecked after logout')
      assert.equal(await page.evaluate('location.hostname'),host)
    })
  }
})

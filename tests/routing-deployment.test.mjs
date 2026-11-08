import assert from "node:assert/strict"
import test from "node:test"
import fs from "node:fs"
import net from "node:net"
import { spawn } from "node:child_process"
import { WORKSPACE_ROUTES, pagePath } from "../src/workspace-routing.ts"

test("Vercel redirects preserve portal selection and keep API routing before the SPA fallback", () => {
  const config = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  const redirect = path => config.redirects.find(rule => rule.source === path && !rule.has)
  assert.equal(redirect('/'), undefined, 'Both domain roots must serve the SPA without a login-path redirect')
  for (const portal of ['admin', 'staff']) {
    assert.equal(redirect(`/${portal}/login`).destination, `/login?tab=${portal}`)
    assert.equal(redirect(`/${portal}/login`).permanent, false)
  }
  assert.equal(redirect('/login'), undefined, 'The combined login cannot redirect back to legacy pages')
  assert.equal(config.rewrites[0].source, '/api/:path*')
  assert.equal(config.rewrites[0].destination, '/api')
  assert.equal(config.rewrites.at(-1).destination, '/index.html')
})

test("host-specific redirects keep disallowed portal paths on the same domain before legacy login redirects", () => {
  const config = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  const match = (host, path) => config.redirects.find(rule => {
    if (rule.has && !rule.has.every(condition => condition.type === 'host' && condition.value === host)) return false
    const prefix = rule.source.replace(/\/:path\*$/, '')
    return rule.source.endsWith('/:path*') ? path === prefix || path.startsWith(prefix + '/') : path === rule.source
  })
  for (const path of ['/login','/login/','/admin','/admin/','/admin/login','/admin/login/','/admin/dashboard','/staff','/staff/login','/opm/documents','/spm/resources']) {
    const rule = match('10buildline.site',path)
    assert.ok(rule,path)
    assert.equal(rule.destination,'/',path)
    assert.equal(rule.permanent,false,path)
    assert.equal(new URL(rule.destination,'https://10buildline.site').hostname,'10buildline.site')
  }
  for (const path of ['/client','/client/','/client/login','/client/projects/123/documents']) {
    assert.equal(match('staff.10buildline.site',path)?.destination,'/',path)
    assert.equal(match('10buildline.site',path)?.destination,path === '/client/login' ? '/' : undefined,path)
  }
  for (const host of ['10buildline.site','staff.10buildline.site','preview.vercel.app','localhost']) {
    for (const path of ['/','/api/v1/auth/login','/api/v1/auth/admin/login','/api/v1/auth/me','/assets/app.js']) assert.equal(match(host,path),undefined,host+path)
  }
  for (const path of ['/admin','/admin/dashboard','/opm/documents','/spm/resources']) assert.equal(match('staff.10buildline.site',path),undefined,path)
  assert.equal(match('staff.10buildline.site','/admin/login').destination,'/?tab=admin')
  assert.equal(match('staff.10buildline.site','/staff/login').destination,'/?tab=staff')
  assert.equal(match('staff.10buildline.site','/login').destination,'/')
  assert.equal(match('preview.vercel.app','/admin'),undefined)
})

test("the production build serves every deep route and dynamic route through the SPA shell", {timeout:30000}, async t => {
  const port = await new Promise(resolve => {
    const socket = net.createServer().listen(0, '127.0.0.1', () => {
      const port = socket.address().port
      socket.close(() => resolve(port))
    })
  })
  const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {cwd:new URL('../',import.meta.url),stdio:'ignore'})
  t.after(async () => { const exit = new Promise(resolve => child.once('exit',resolve)); child.kill(); await exit })
  const origin = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 15000
  while (true) {
    try { if ((await fetch(origin)).ok) break } catch {}
    if (Date.now() > deadline) throw Error('Production preview did not start')
    await new Promise(resolve => setTimeout(resolve,100))
  }
  const paths = ['/', '/client/login', '/login', '/admin/login', '/staff/login', '/client/projects/project-123/documents']
  for (const [role,pages] of Object.entries(WORKSPACE_ROUTES)) for (const page of Object.keys(pages)) paths.push(pagePath(role,page))
  for (const path of paths) {
    const response = await fetch(origin+path)
    assert.equal(response.status,200,path)
    const html = await response.text()
    assert.match(html, /id="root"/,path)
    const entry = html.match(/src="(\/assets\/index-[^"]+\.js)"/)
    assert.ok(entry,path)
    assert.equal((await fetch(origin+entry[1])).status,200,`Nested URL must load its assets: ${path}`)
  }
})

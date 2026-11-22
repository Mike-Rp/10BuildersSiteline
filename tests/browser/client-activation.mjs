import assert from "node:assert/strict"
import test from "node:test"
import { createServer } from "node:http"
import { once } from "node:events"
import { existsSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { chromePath, launchChrome } from "./chrome.mjs"

test("client activation and existing login use the API contract at mobile and desktop sizes", { skip: !chromePath, timeout: 60000 }, async t => {
  const dist = path.resolve("dist")
  const user = { id: "client-browser", role: "client", full_name: "Test Client", email: "client@example.test", status: "active" }
  const token = `test.${Buffer.from(JSON.stringify({ sub: user.id, details: { id: user.id, role: user.role } })).toString("base64url")}.test`
  let activationRequests = 0
  let loginRequests = 0
  let outcome = "ACTIVATION_CODE_INVALID"
  const server = createServer((req, res) => {
    const route = new URL(req.url, "http://localhost").pathname
    const json = (body, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" })
      res.end(JSON.stringify(body))
    }
    if (route === "/api/v1/auth/client/activate") {
      activationRequests++
      const result = outcome
      req.resume()
      setTimeout(() => {
        if (result === "active") json({ data: { status: "active" } })
        else if (result === "unavailable") json({}, 404)
        else json({ error: { code: result } }, 422)
      }, 300)
      return
    }
    if (route === "/api/v1/auth/login") {
      loginRequests++
      req.resume()
      if (loginRequests === 1) return json({}, 401)
      if (loginRequests === 2) return json({ error: { code: "CLIENT_ACTIVATION_REQUIRED" } }, 403)
      return json({ user, token })
    }
    if (route.startsWith("/api/v1/")) {
      if (req.headers.authorization !== `Bearer ${token}`) return json({}, 401)
      if (route === "/api/v1/auth/me" || route === `/api/v1/accounts/${user.id}`) return json(user)
      if (route === "/api/v1/workspace") return json({ accounts: {}, projects: {}, preferences: {} })
      return json([])
    }
    let file = path.resolve(dist, "." + route)
    if (!file.startsWith(dist + path.sep) || !existsSync(file) || !statSync(file).isFile()) file = path.join(dist, "index.html")
    const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml" }
    res.writeHead(200, { "Content-Type": types[path.extname(file)] ?? "application/octet-stream" })
    res.end(readFileSync(file))
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  t.after(() => { server.closeAllConnections(); server.close() })
  const browser = await launchChrome()
  t.after(() => browser.close())
  const page = await browser.page()
  const origin = `http://127.0.0.1:${server.address().port}`
  const navigate = route => page.call("Page.navigate", { url: origin + route })
  const waitText = value => page.wait(`document.body.innerText.includes(${JSON.stringify(value)})`)
  const enter = values => page.evaluate(`(() => {
    const inputs = [...document.querySelectorAll(".login-form input")];
    ${JSON.stringify(values)}.forEach((value, index) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(inputs[index], value);
      inputs[index].dispatchEvent(new Event("input", { bubbles: true }));
    });
  })()`)
  const submit = () => page.click(".login-submit")

  await navigate("/client/overview")
  await page.wait('location.pathname === "/client/login" && !!document.querySelector(".login-form")')
  assert.equal(await page.evaluate('!!document.querySelector(".sidebar")'), false)
  await enter([user.email, "ExamplePass12"])
  await submit()
  await waitText("That email and password don't match")
  await submit()
  await waitText("pending activation")
  await page.click('a[href="/client/activate"]')
  await waitText("Activate your client account")
  for (const width of [320, 375, 768, 1440]) {
    await page.call("Emulation.setDeviceMetricsOverride", { width, height: 800, mobile: width <= 768, deviceScaleFactor: 1 })
    assert.equal(await page.evaluate(`document.documentElement.clientWidth === ${width} && document.documentElement.scrollWidth === ${width} &&
      [...document.querySelectorAll(".login-form input, .login-submit")].every(input => {
        const box = input.getBoundingClientRect();
        return box.width > 0 && box.left >= 0 && box.right <= window.innerWidth;
      })`), true, `${width}px activation layout`)
  }

  await enter(["invalid", "", "short", "different"])
  await submit()
  await waitText("Enter a valid email")
  await waitText("The passwords do not match")
  assert.equal(activationRequests, 0)
  await enter([user.email, "test-code", "ExamplePass12", "ExamplePass12"])
  await page.evaluate(`(() => { const form = document.querySelector(".login-form"); form.requestSubmit(); form.requestSubmit(); })()`)
  await waitText("This code is invalid")
  assert.equal(activationRequests, 1)
  outcome = "ACTIVATION_CODE_EXPIRED"
  await submit()
  await waitText("This code has expired")
  outcome = "unavailable"
  await submit()
  await waitText("Account activation is currently unavailable")
  outcome = "CLIENT_ALREADY_ACTIVE"
  await submit()
  await waitText("Account already active")
  assert.equal(await page.evaluate('!!document.querySelector(".login-form")'), false)
  await navigate("/client/activate")
  await waitText("Activate your client account")
  outcome = "active"
  await enter([user.email, "valid-code", "ExamplePass12", "ExamplePass12"])
  await submit()
  await waitText("Account activated")
  assert.equal(await page.evaluate(`Object.values(localStorage).some(value => value.includes("ExamplePass12") || value.includes("valid-code"))`), false)
  assert.equal(activationRequests, 5)
  await page.click('a[href="/client/login"]')
  await page.wait('location.pathname === "/client/login" && !!document.querySelector(".login-form")')
  await enter([user.email, "ExamplePass12"])
  await submit()
  await page.wait('location.pathname === "/client/overview" && !!document.querySelector(".sidebar")')
  await navigate("/client/activate")
  await page.wait('location.pathname === "/client/overview" && !!document.querySelector(".sidebar")')
  assert.equal(await page.evaluate('!!document.querySelector(".login-form")'), false)
})

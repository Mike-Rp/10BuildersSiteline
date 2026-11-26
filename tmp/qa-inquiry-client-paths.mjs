import { createServer } from "vite"
import { chromium } from "file:///C:/Users/ADMIN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs"
import { mkdir } from "node:fs/promises"
const server = await createServer({ server: { port: 0, strictPort: false, host: "127.0.0.1", watch: null }, logLevel: "error" })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ channel: "msedge", headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on("pageerror", error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tmp/qa-inquiry-client-paths.html`)
  await page.getByRole("button", { name: "New project inquiry", exact: true }).click()
  await page.locator('[name="inquiry-client-record"][value="new"]').check()
  await page.locator('[name="inquiry-client-type"][value="company"]').check()
  await page.getByRole("button", { name: "Next: Client details", exact: true }).click()
  for (const [label,value] of [["Company name","Sample Development Corporation"],["Primary contact (representative)","Maria Santos"],["Position / designation","Coordinator"],["Email address","maria@example.com"]]) await page.getByLabel(label,{exact:true}).fill(value)
  await page.locator('input[type=tel]').fill("123456789")
  await mkdir("tmp/inquiry-qa", { recursive: true })
  await page.screenshot({ path: "tmp/inquiry-qa/company-desktop.png", fullPage: true })
  await page.getByRole("button", { name: "Back to inquiries", exact: true }).click()
  await page.getByRole("dialog", { name: "Save this inquiry as a draft?", exact: true }).waitFor()
  await page.getByRole("dialog", { name: "Save this inquiry as a draft?", exact: true }).evaluate(el => Promise.all(el.parentElement.getAnimations({subtree:true}).filter(a => a.effect.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))))
  await page.screenshot({ path: "tmp/inquiry-qa/leave-desktop.png", fullPage: true })
  await page.getByRole("button", { name: "Keep editing", exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: "tmp/inquiry-qa/company-mobile.png", fullPage: true })
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error("Page overflows mobile viewport")
  if (errors.length) throw Error(errors.join("; "))
  console.log("Browser check passed: company form, exit dialog, mobile width, and no runtime errors.")
} finally { await browser?.close(); await server.close() }

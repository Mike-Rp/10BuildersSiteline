import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"

test(
  "complete extension UI across existing role workspaces, revisions, decisions, refresh, isolation and reset without network",
  { timeout: 60000 },
  async (t) => {
    const dom = new JSDOM('<div id="root"></div>', {
      url: "http://localhost:8443/?extensionDemo=1",
      pretendToBeVisual: true,
    })
    const previous = new Map()
    const w = dom.window
    for (const key of [
      "window",
      "document",
      "HTMLElement",
      "Element",
      "Node",
      "Event",
      "KeyboardEvent",
      "MouseEvent",
      "File",
      "Blob",
      "MutationObserver",
      "getComputedStyle",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "sessionStorage",
      "localStorage",
      "HTMLInputElement",
      "HTMLSelectElement",
      "HTMLTextAreaElement",
      "SVGElement",
      "CustomEvent",
    ]) {
      previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
      Object.defineProperty(globalThis, key, {
        value: key === "window" ? w : key === "document" ? w.document : w[key],
        configurable: true,
        writable: true,
      })
    }
    previous.set(
      "IS_REACT_ACT_ENVIRONMENT",
      Object.getOwnPropertyDescriptor(globalThis, "IS_REACT_ACT_ENVIRONMENT"),
    )
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    w.matchMedia = () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    })
    w.scrollTo = () => {}
    w.HTMLElement.prototype.scrollIntoView = () => {}
    const network = []
    t.mock.method(globalThis, "fetch", async (...args) => {
      network.push(String(args[0]))
      throw Error("Demo must not call backend")
    })
    const server = await createServer({
      cacheDir: `node_modules/.vite-tests/extension-${process.pid}`,
      server: { middlewareMode: true, hmr: false, watch: null },
      appType: "custom",
      logLevel: "silent",
      optimizeDeps: { noDiscovery: true, include: [] },
    })
    const { default: React, act } = await import("react")
    const { createRoot } = await import("react-dom/client")
    let root = createRoot(document.getElementById("root"))
    try {
      const { default: App } = await server.ssrLoadModule("/src/App.tsx")
      const { default: Demo } = await server.ssrLoadModule(
        "/src/ExtensionDemo.tsx",
      )
      const mount = () => root.render(React.createElement(App))
      const click = async (label, within = document) => {
        const b = [...within.querySelectorAll("button")].find(
          (b) =>
            b.textContent.trim() === label ||
            b.getAttribute("aria-label") === label,
        )
        assert.ok(b, `Missing button: ${label}`)
        assert.ok(!b.disabled, `Disabled button: ${label}`)
        await act(() => b.click())
      }
      const change = async (el, value) => {
        assert.ok(el, `Missing control for ${value}`)
        await act(() => {
          Object.getOwnPropertyDescriptor(
            Object.getPrototypeOf(el),
            "value",
          ).set.call(el, value)
          el.dispatchEvent(
            new w.Event(el.tagName === "SELECT" ? "change" : "input", {
              bubbles: true,
            }),
          )
        })
      }
      const field = (label) => {
        const l = [...document.querySelectorAll("label")].find(
          (l) => l.textContent === label,
        )
        assert.ok(l, `Missing field ${label}`)
        return document.getElementById(l.htmlFor)
      }
      const switchTo = (id) => change(field("Demo account"), id)
      const card = (name) =>
        [...document.querySelectorAll(".extension-project")].find(
          (c) => c.querySelector("h3").textContent === name,
        )
      const state = () =>
        JSON.parse(localStorage.getItem("siteline-extension-demo-v1"))
      const project = (id) => state().projects.find((p) => p.id === id)
      const latestRequest = (id) =>
        state()
          .requests.filter((r) => r.projectId === id)
          .at(-1)
      const dialog = () =>
        [...document.querySelectorAll('[role="dialog"]')].at(-1)
      const close = () => click("Close dialog", dialog())
      const openCurrent = (name) => click("View current request", card(name))
      const fill = async (
        date,
        reason = "Rainfall delayed waterproofing and delivery of electrical fixtures.",
      ) => {
        await change(field("Reason for Delay"), reason)
        await change(
          field("Remaining Construction Activities"),
          "Complete waterproofing, final electrical fit-off and turnover.",
        )
        await change(field("Proposed Revised Completion Date"), date)
      }
      await act(mount)
      assert.ok(document.querySelector(".role-workspace"))
      assert.match(card("Santos Residence").textContent, /85%/)
      assert.ok(
        !document.body.textContent.includes("Demo Reyes Annex"),
        "SPM assignments are isolated",
      )
      await click("Request Extension", card("Santos Residence"))
      assert.equal(
        dialog().querySelectorAll(".extension-form > .field").length,
        8,
      )
      assert.equal(field("Project Name").readOnly, true)
      assert.equal(field("Estimated Time of Completion (ETC)").readOnly, true)
      assert.ok(!dialog().textContent.includes("Project ID"))
      await click("Submit Delay Report")
      assert.match(dialog().textContent, /Explain the reason/)
      await fill("2026-10-26")
      await click("Submit Delay Report")
      assert.match(dialog().textContent, /later than the current/)
      await fill("2026-11-25")
      // Metadata is interactive; actual contents never enter the persisted state.
      const upload = field("Supporting Documents / Site Evidence")
      await act(() => {
        Object.defineProperty(upload, "files", {
          value: [
            new w.File(["demo-file-content"], "site-log.pdf", {
              type: "application/pdf",
            }),
          ],
          configurable: true,
        })
        upload.dispatchEvent(new w.Event("change", { bubbles: true }))
      })
      assert.match(dialog().textContent, /site-log.pdf/)
      assert.match(dialog().textContent, /application\/pdf/)
      await click("Remove site-log.pdf")
      assert.ok(!dialog().textContent.includes("site-log.pdf"))
      await act(() =>
        upload.dispatchEvent(new w.Event("change", { bubbles: true })),
      )
      await click("Save Draft")
      assert.equal(latestRequest("p1").status, "Draft")
      assert.ok(
        !localStorage
          .getItem("siteline-extension-demo-v1")
          .includes("demo-file-content"),
      )
      await openCurrent("Santos Residence")
      await click("Edit Draft")
      assert.equal(
        field("Reason for Delay").value,
        "Rainfall delayed waterproofing and delivery of electrical fixtures.",
      )
      await click("Submit Delay Report")
      assert.equal(dialog(), undefined)
      assert.equal(latestRequest("p1").status, "Pending OPM Review")
      assert.equal(project("p1").approved, "2026-10-26")
      await switchTo("a2")
      assert.match(
        document.querySelector(".breadcrumb").textContent,
        /Deadlines/,
      )
      await openCurrent("Santos Residence")
      assert.ok(!dialog().textContent.includes("Approve Extension"))
      await click("Return for Revision")
      await click("Confirm Return for Revision")
      assert.equal(
        latestRequest("p1").status,
        "Pending OPM Review",
        "blank return is blocked",
      )
      await change(
        field("Written reason (required)"),
        "Please attach the revised supplier delivery schedule.",
      )
      await click("Confirm Return for Revision")
      await close()
      await switchTo("a5")
      await openCurrent("Santos Residence")
      assert.match(dialog().textContent, /revised supplier delivery schedule/)
      await click("Revise & Resubmit")
      await fill(
        "2026-11-25",
        "Revised report: supplier schedule and rainfall logs attached.",
      )
      await click("Submit Delay Report")
      await switchTo("a2")
      await openCurrent("Santos Residence")
      await click("Endorse to Client")
      await change(
        field("Review remarks (optional)"),
        "Reviewed the revised site log and delivery schedule.",
      )
      await click("Confirm Endorse to Client")
      assert.equal(project("p1").approved, "2026-10-26")
      await close()
      await switchTo("a9")
      assert.ok(document.querySelector(".client-portal"))
      assert.match(
        document.querySelector(".extension-workflow").textContent,
        /Santos Residence/,
      )
      await openCurrent("Santos Residence")
      assert.match(dialog().textContent, /Reviewed the revised site log/)
      assert.ok(
        !dialog().querySelector("textarea"),
        "Client cannot edit the report",
      )
      await click("Approve Extension")
      assert.equal(
        project("p1").approved,
        "2026-10-26",
        "confirmation is required",
      )
      await click("Confirm Approve Extension")
      assert.equal(project("p1").approved, "2026-11-25")
      assert.equal(project("p1").original, "2026-10-26")
      assert.equal(project("p1").lifecycle, "Ongoing")
      await close()
      // Client rejection scenario through the existing project selector.
      await change(field("Your project"), "p3")
      await openCurrent("Demo Rivera Retail Fit-out")
      await click("Reject Extension")
      await change(
        field("Written reason (required)"),
        "Requested duration is not supported by the remaining work.",
      )
      await click("Confirm Reject Request")
      assert.equal(latestRequest("p3").status, "Rejected")
      assert.equal(project("p3").approved, "2026-10-24")
      await close()
      await switchTo("a5")
      assert.ok(
        [...card("Demo Rivera Retail Fit-out").querySelectorAll("button")].some(
          (b) => b.textContent === "Request Extension",
        ),
      )
      // A second extension starts at the last approved deadline.
      await click("Request Extension", card("Demo Cruz Duplex"))
      assert.match(
        field("Estimated Time of Completion (ETC)").value,
        /Sep 30, 2026/,
      )
      assert.match(
        field("Current Approved Completion Date").value,
        /Oct 20, 2026/,
      )
      await fill("2026-11-15")
      await click("Submit Delay Report")
      await switchTo("a2")
      await openCurrent("Demo Cruz Duplex")
      await click("Endorse to Client")
      await click("Confirm Endorse to Client")
      await close()
      await switchTo("a9")
      await change(field("Your project"), "p4")
      await openCurrent("Demo Cruz Duplex")
      await click("Approve Extension")
      await click("Confirm Approve Extension")
      assert.deepEqual(
        project("p4").deadlines.map((d) => d.date),
        ["2026-10-20", "2026-11-15"],
      )
      await close()
      await switchTo("a1")
      assert.match(document.body.textContent, /Delay & Extension Monitoring/)
      assert.match(document.body.textContent, /Pending OPM Review/)
      const row = [...document.querySelectorAll("tbody tr")].find((r) =>
        r.textContent.includes("Santos Residence"),
      )
      await click("View report", row)
      assert.match(dialog().textContent, /Read-only monitoring/)
      for (const forbidden of [
        "Approve Extension",
        "Reject Request",
        "Endorse to Client",
        "Revise & Resubmit",
      ])
        assert.ok(
          ![...dialog().querySelectorAll("button")].some(
            (b) => b.textContent === forbidden,
          ),
        )
      await close()
      await switchTo("a6")
      assert.ok(card("Demo Reyes Annex"))
      assert.ok(!card("Santos Residence"))
      await click("Request Extension", card("Demo Reyes Annex"))
      assert.equal(
        field("Current Project Progress").value,
        "Progress Unavailable",
      )
      await click("Cancel", dialog())
      await switchTo("a11")
      assert.ok(!document.body.textContent.includes("Santos Residence"))
      assert.match(
        document.body.textContent,
        /Requests appear here after the OPM endorses/,
      )
      // Unmount/remount the actual App: role preference, decisions and history survive.
      await switchTo("a5")
      await act(() => root.unmount())
      root = createRoot(document.getElementById("root"))
      await act(mount)
      assert.equal(field("Demo account").value, "a5")
      assert.match(card("Santos Residence").textContent, /Nov 25, 2026/)
      await click(
        "Demo notifications (" +
          [...document.querySelectorAll("button")]
            .find((b) => b.textContent.startsWith("Demo notifications ("))
            .textContent.match(/\((\d+)\)/)[1] +
          ")",
      )
      assert.match(dialog().textContent, /Approved/)
      await click("Mark all demo notifications read")
      await close()
      await click("Reset Demo Data")
      await click("Confirm Reset Demo Data")
      assert.equal(project("p1").approved, "2026-10-26")
      assert.equal(state().requests.length, 3)
      assert.equal(project("p4").deadlines.length, 1)
      // The OPM rejection and SPM withdrawal paths also run through their dialogs.
      await switchTo("a2")
      await openCurrent("Demo Reyes Townhouse")
      await click("Reject Request")
      await change(field("Written reason (required)"), "Attach a site diary that supports the proposed duration.")
      await click("Confirm Reject Request")
      assert.equal(latestRequest("p2").status, "Rejected")
      assert.equal(project("p2").approved, "2026-10-22")
      await close()
      await switchTo("a5")
      await click("Request Extension", card("Demo Reyes Townhouse"))
      await fill("2026-11-18")
      await click("Submit Delay Report")
      await openCurrent("Demo Reyes Townhouse")
      await click("Withdraw Request")
      await click("Confirm Withdraw Request")
      assert.equal(latestRequest("p2").status, "Withdrawn")
      assert.equal(project("p2").approved, "2026-10-22")
      await close()
      assert.ok([...card("Demo Reyes Townhouse").querySelectorAll("button")].some(b => b.textContent === "Request Extension"))
      await click("Reset Demo Data")
      await click("Confirm Reset Demo Data")
      assert.equal(
        network.length,
        0,
        "all tested demo screens avoid backend calls",
      )
      await click("Exit Demo")
      // Verify the explicit production gate independently of Vite's dev SSR default.
      await act(() =>
        root.render(
          React.createElement(
            Demo,
            { enabled: false },
            React.createElement("p", null, "Existing application"),
          ),
        ),
      )
      assert.equal(document.body.textContent, "Existing application")
      assert.equal(document.querySelector(".extension-demo-launch"), null)
    } finally {
      await act(() => root.unmount())
      await server.close()
      dom.window.close()
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else delete globalThis[key]
      }
    }
  },
)

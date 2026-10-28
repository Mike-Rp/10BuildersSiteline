import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createReportPdf } from "../src/report-pdf.ts"
import { monthlyPrintDocument } from "../src/monthly-report.ts"
import { summaryPrintDocument } from "../src/monthly-summary.ts"
import { buildMonthlySummary, summaryView } from "../Thesis-Backend/src/domain/monthly-summary.js"

const fixture = () => ({
  project: { id: "example", name: "Gonzales — Señor & Señora <script>literal</script>", type: "Mixed-Use", status: "active" },
  period: { month: "2026-10", timezone: "Asia/Manila", start: "2026-09-30T16:00:00Z", end: "2026-10-31T16:00:00Z", cutoff: "2026-10-28T05:00:00Z", generatedAt: "2026-10-28T05:00:00Z", monthToDate: true },
  coverageFrom: null, opening: { earned: null, total: null, percentage: null, reason: "History incomplete" },
  closing: { earned: 80, total: 290, percentage: 80 / 290 * 100, reason: null }, netChange: null, projection: "client",
  limitations: ["Unavailable — historical approval or scope records are incomplete."], completedPhases: null,
  // Defensive rendering must keep staff-only data out even if such fields exist.
  scopeLabel: "SECRET staff scope", approvals: { events: 99 }, pending: { evidence: 99, reports: 99, rework: 99 },
  activity: [{ date: "2026-10-22T00:00:00Z", phase: "Design", record: "SECRET internal note", change: 10 }],
  updates: Array.from({ length: 60 }, (_, i) => ({ date: "2026-10-22T00:00:00Z", phase: "Office Fit-Out", text: `Shared update ${i + 1}: façade and finishes checked. ${"Long shared project note. ".repeat(5)}` })),
})

test("direct report PDFs preserve Unicode, literal text, privacy and complete multipage content", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window")
  const dom = new JSDOM("")
  Object.defineProperty(globalThis, "window", { value: dom.window, configurable: true })
  try {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs")
    const blob = await createReportPdf(monthlyPrintDocument(fixture()))
    assert.equal(blob.type, "application/pdf")
    const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()), useSystemFonts: true })
    const pdf = await task.promise
    try {
      assert.ok(pdf.numPages > 1, "long reports paginate")
      let text = ""
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const viewport = page.getViewport({ scale: 1 })
        assert.ok(viewport.height > viewport.width, "project PDF uses portrait pages")
        const contents = await page.getTextContent()
        const pageText = contents.items.map(item => item.str || "").join(" ")
        text += pageText
        if (i > 1 && pageText.includes("Shared update")) assert.match(pageText, /Date.*Phase.*Update/, "table headers repeat on later pages")
        for (const item of contents.items.filter(item => item.str?.trim())) {
          assert.ok(item.transform[4] >= 30 && item.transform[4] + item.width <= viewport.width - 30, `text fits horizontally: ${item.str}`)
          assert.ok(item.transform[5] >= 15 && item.transform[5] <= viewport.height - 20, `text fits vertically: ${item.str}`)
        }
      }
      assert.match(text, /Señor & Señora <script>literal<\/script>/)
      assert.match(text, /façade/)
      assert.match(text, /Unavailable/)
      assert.match(text, /Shared update 60/)
      assert.doesNotMatch(text, /SECRET|Pending reviews|Approval events|Credit withdrawn/)
    } finally { await task.destroy() }

    const reports=Array.from({length:70},(_,i)=>({...fixture(),project:{...fixture().project,id:String(i),name:`Long authorized sample project name ${i+1}`},projection:'staff',pending:{evidence:1,reports:2,rework:0},rework:{confirmed:1,withdrawals:1,withdrawn:10}}))
    const source=buildMonthlySummary({reports,period:reports[0].period,projection:'staff'})
    const summary = await createReportPdf(summaryPrintDocument(source,summaryView(source)), true)
    const summaryTask = getDocument({ data: new Uint8Array(await summary.arrayBuffer()) })
    const pdfSummary = await summaryTask.promise
    try {
      const viewport = (await pdfSummary.getPage(1)).getViewport({ scale: 1 })
      assert.ok(viewport.width > viewport.height, "overall summary uses landscape pages")
      assert.ok(pdfSummary.numPages>1)
      let text=''
      for(let i=1;i<=pdfSummary.numPages;i++){
        const contents=await (await pdfSummary.getPage(i)).getTextContent()
        text+=contents.items.map(item=>item.str||'').join(' ')
        for(const item of contents.items.filter(item=>item.str?.trim()))assert.ok(item.transform[4]>=30&&item.transform[4]+item.width<=viewport.width-30,`summary text fits: ${item.str}`)
      }
      assert.match(text,/Long authorized sample project name 70/)
      assert.match(text,/Approval events/)
    } finally { await summaryTask.destroy() }
  } finally {
    dom.window.close()
    if (previous) Object.defineProperty(globalThis, "window", previous)
    else delete globalThis.window
  }
})

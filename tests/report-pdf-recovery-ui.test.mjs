import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"
import { buildMonthlyReport, reportPeriod } from "../Thesis-Backend/src/domain/monthly-report.js"
import { buildMonthlySummary } from "../Thesis-Backend/src/domain/monthly-summary.js"
import { summaryView, SUMMARY_FILTERS } from "../src/monthly-summary.ts"
import { currentReportMonth } from "../src/monthly-report.ts"

test("missing PDF chunks show reload recovery in project and overall reports, while CSV remains usable", {timeout:60000}, async () => {
  const dom = new JSDOM('<div id="root"></div>',{url:"http://localhost"})
  const w=dom.window, saved=new Map()
  const period=reportPeriod(currentReportMonth())
  const report=buildMonthlyReport({project:{id:"p1",name:"Sample project",type:"Commercial",status:"active",created_at:"2020-01-01"},baseline:null,events:[],period,role:["client"]})
  const summary=buildMonthlySummary({reports:[report],period,projection:"client",excludedAfterCutoff:0})
  const view=summaryView(summary,SUMMARY_FILTERS)
  const requests=[]
  for (const [key,value] of Object.entries({window:w,document:w.document,Node:w.Node,IS_REACT_ACT_ENVIRONMENT:true,fetch:async (url,init) => {
    requests.push({url:String(url),init})
    const overall=String(url).includes("/reports/monthly-summary")
    const format=init?.body && JSON.parse(init.body).format
    return Response.json({data:format==="csv"?{csv:"sample csv"}:overall?{summary,view,snapshot:"summary-token"}:{report,snapshot:"project-token"}})
  }})) {
    saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})
  }
  const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL
  let downloaded
  URL.createObjectURL=blob=>{downloaded=blob;return "blob:test"};URL.revokeObjectURL=()=>{}
  w.HTMLAnchorElement.prototype.click=function(){}
  const server=await createServer({plugins:[{name:"missing-pdf-test",enforce:"pre",
    resolveId(source,importer){if(source==="./report-pdf" && importer?.endsWith("report-pdf-loader.ts"))return "\0missing-pdf"},
    load(id){if(id==="\0missing-pdf")return 'throw new TypeError("Importing a module script failed."); export function createReportPdf() {}'}
  }],server:{middlewareMode:true,hmr:false,watch:null},appType:"custom",logLevel:"silent",optimizeDeps:{noDiscovery:true,include:[]}})
  const {default:React,act}=await import("react"),{createRoot}=await import("react-dom/client")
  const root=createRoot(document.getElementById("root"))
  try {
    const {default:MonthlyReport}=await server.ssrLoadModule("/src/MonthlyReport.tsx")
    const {default:Reports}=await server.ssrLoadModule("/src/Reports.tsx")
    for (const [index,Component] of [MonthlyReport,Reports].entries()) {
      await act(async()=>root.render(React.createElement(Component,{key:index,projects:[{id:"p1",name:"Sample project"}],initialProjectId:"p1",onClose(){}})))
      const button=text=>[...document.querySelectorAll("button")].find(button=>button.textContent===text)
      await act(async()=>button("Download PDF").click())
      for (let attempt=0; attempt<250 && !document.querySelector(".report-pdf-recovery, .error"); attempt++)
        await act(()=>new Promise(resolve=>setTimeout(resolve,20)))
      const alert=document.querySelector(".report-pdf-recovery[role=alert]")
      assert.ok(alert,`Exporter import failures must show recovery: ${document.querySelector('.error')?.textContent || button('Preparing…')?.textContent || 'No export error'}`)
      assert.match(alert.textContent,/Reload the page/)
      assert.doesNotMatch(alert.textContent,/MIME|assets\/|TypeError/)
      assert.ok(button("Reload page"))
      assert.equal(button("Print").disabled,false)
      if (index===0) assert.ok(document.body.textContent.includes("historical approval or scope records are incomplete"),"Historical-data limitation remains distinct")
      await act(()=>{const select=document.querySelector(".report-export-actions select");select.value="csv";select.dispatchEvent(new w.Event("change",{bubbles:true}))})
      await act(async()=>button("Export CSV").click())
      assert.equal(await downloaded.text(),"sample csv")
      assert.equal(document.querySelector(".report-pdf-recovery"),null)
    }
  } finally {
    await act(()=>root.unmount());await server.close();dom.window.close()
    URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke
    for(const [key,descriptor] of saved)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key]
  }
})

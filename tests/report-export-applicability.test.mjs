import test from "node:test"
import assert from "node:assert/strict"
import { createServer } from "vite"
import { buildMonthlyReport, reportPeriod } from "../Thesis-Backend/src/domain/monthly-report.js"

test("report export rejects pre-creation periods for every role and format after rechecking authorization", async () => {
  const secret=process.env.JWT_SECRET
  process.env.JWT_SECRET="isolated-report-export-test-secret"
  const fixture={user:null,allowed:true,project:{id:"project",name:"Project",type:"Commercial",status:"active",created_at:"2026-11-05T00:00:00Z"}}
  globalThis.__reportExportFixture=fixture
  const server=await createServer({plugins:[{name:"isolated-report-export-dependencies",enforce:"pre",
    resolveId(source){
      if(source.endsWith("/transaction.utility.js"))return "\0report-transaction"
      if(source.endsWith("/access.utility.js"))return "\0report-access"
    },
    load(id){
      if(id==="\0report-transaction")return `export const withTransaction=async task=>task({query:async sql=>({rows:sql.includes('select p.id')?[globalThis.__reportExportFixture.project]:[]})});`
      if(id==="\0report-access")return `
        export class HttpError extends Error {constructor(status,message){super(message);this.status=status}}
        export const requireUser=async()=>globalThis.__reportExportFixture.user;
        export const hasProjectAccess=async()=>globalThis.__reportExportFixture.allowed;
        export const isUuid=()=>true;
        export const handleError=(res,error)=>{res.code=error.status||500;res.body={message:error.message};return res};
        export const sendOk=(res,message,count,data)=>{res.code=200;res.body=data;return res};`
    }
  }],server:{middlewareMode:true,hmr:false,watch:null},appType:"custom",logLevel:"silent",optimizeDeps:{noDiscovery:true,include:[]}})
  try {
    const {exportMonthlyReport,signReport}=await server.ssrLoadModule("/Thesis-Backend/src/services/reports/controller.js")
    const make=(month)=>buildMonthlyReport({project:fixture.project,baseline:null,events:[],period:reportPeriod(month,new Date("2026-11-13T00:00:00Z")),role:"client"})
    const request=async(report,format)=>{
      const response={code:0,body:null,set(){return this}}
      await exportMonthlyReport({params:{id:"project"},body:{snapshot:signReport(report,fixture.user),format}},response)
      return response
    }
    for(const role of ["admin","opm","spm","client"]) {
      fixture.user={id:role,role}
      for(const format of ["csv","print"]) {
        for(const report of [make("2026-09"),{...make("2026-09"),createdAfterPeriod:undefined}]) {
          const response=await request(report,format)
          assert.equal(response.code,422)
          assert.match(response.body.message,/not applicable/)
          assert.equal(response.body.csv,undefined)
          assert.equal(response.body.report,undefined)
        }
      }
    }
    fixture.user={id:"client",role:"client"}
    assert.equal((await request(make("2026-11"),"csv")).code,200,"Applicable periods with incomplete history remain exportable")
    assert.equal((await request(make("2026-11"),"print")).code,200)
    fixture.allowed=false
    assert.equal((await request(make("2026-09"),"csv")).code,404,"Revoked access is rejected before period information is disclosed")
    fixture.allowed=true
    const boundary=make("2026-09")
    fixture.project.created_at=boundary.period.cutoff
    assert.equal((await request({...boundary,createdAfterPeriod:undefined},"print")).code,422,"Creation exactly at the exclusive cutoff is outside the period")
  } finally {
    await server.close();delete globalThis.__reportExportFixture
    if(secret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=secret
  }
})

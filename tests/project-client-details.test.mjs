import assert from "node:assert/strict"
import test from "node:test"

test("monitoring shows linked client contact details and honest missing-data states",async()=>{
  const {createServer}=await import("vite")
  const {default:React}=await import("react")
  const {renderToStaticMarkup}=await import("react-dom/server")
  const {JSDOM}=await import("jsdom")
  const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:"custom",logLevel:"silent",optimizeDeps:{noDiscovery:true,include:[]}})
  try {
    const {default:Details}=await server.ssrLoadModule("/src/ProjectClientDetails.tsx")
    const render=project=>new JSDOM(renderToStaticMarkup(React.createElement(Details,{project,accounts:[]})))
    let dom=render({clientId:"c",clientAccounts:[{id:"c",name:"Linked Client",email:"client@example.test",phone:"09123456789",contactPerson:"Owner Contact"}]})
    assert.match(dom.window.document.body.textContent,/Linked Client/)
    assert.match(dom.window.document.body.textContent,/client@example.test/)
    assert.match(dom.window.document.body.textContent,/09123456789/)
    assert.match(dom.window.document.body.textContent,/Owner Contact/)
    dom.window.close()
    dom=render({clientId:"c",clientAccounts:[{id:"c",name:"Linked Client",email:"",phone:""}]})
    assert.equal([...dom.window.document.querySelectorAll('dd')].filter(el=>el.textContent==='Not on file').length,2)
    dom.window.close()
    dom=render({clientId:"client:legacy",clientAccounts:[]})
    assert.match(dom.window.document.body.textContent,/No linked client account/)
    assert.equal(dom.window.document.querySelectorAll('dd').length,0)
    dom.window.close()
  } finally {await server.close()}
})

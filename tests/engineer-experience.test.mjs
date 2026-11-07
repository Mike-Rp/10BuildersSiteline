import assert from "node:assert/strict"
import test from "node:test"
import { emptyState, opmCandidates, spmCandidates } from "../src/model.ts"
import { normalizeExperience, experienceYears, experienceMonths, experienceText } from "../Thesis-Backend/src/domain/engineer-experience.js"

const person = (id, years, role = "spm") => ({ id, name: id === "seven" ? "Z Seven Years" : "A Five Years", email: `${id}@test.example`, phone: "", role,
  scope: ["Structural"], projectTypes: ["Residential"], status: "active", added: "2026-10-01", license: "TEST", expiry: "2099-01-01", hasProfessionalCredentials: true, docs: [], experienceByType: { Residential: years } })

test("allocation prioritizes relevant experience over name and lower workload, retaining eligibility gates", () => {
  const state = emptyState(), five = person("five", 5), seven = person("seven", 7)
  five.experienceByType.Commercial = 50
  state.accounts = [five, seven]
  assert.deepEqual(spmCandidates(state, "Residential", "Structure").map(c => c.account.id), ["seven", "five"])
  seven.assignmentHold = true
  assert.equal(spmCandidates(state, "Residential", "Structure")[0].account.id, "five")
  seven.assignmentHold = false; seven.expiry = "2000-01-01"
  assert.equal(spmCandidates(state, "Residential", "Structure")[0].account.id, "five")
  const opmFive = person("five", 5, "opm"), opmSeven = person("seven", 7, "opm")
  state.accounts = [opmFive, opmSeven]
  state.projects = [{ id: "busy", opmId: "seven", status: "active", team: [] }]
  assert.deepEqual(opmCandidates(state, "Residential").map(a => a.id), ["seven", "five"])
  opmSeven.status = "suspended"
  assert.equal(opmCandidates(state, "Residential")[0].id, "five")
})

test("experience validation keeps project types separate and unknown history is not fabricated", () => {
  assert.deepEqual(normalizeExperience({ Residential: 7, Commercial: 5, "Mixed-Use": 0 }), { Residential: 7, Commercial: 5, "Mixed-Use": 0 })
  for (const value of [null, [], { Residential: -1 }, { Residential: 7.5 }, { Residential: "7" }, { Residential: 81 }, { Other: 7 }]) assert.throws(() => normalizeExperience(value))
  assert.equal(experienceYears({ Commercial: 50 }, "Residential"), 0)
  assert.match(experienceText(undefined, "Residential"), /not recorded/)
  assert.equal(experienceText({ Residential: 7 }, "Residential"), "7 years in Residential")
})

test("Admin account form saves per-project experience and rejects fractional years without a resume field", async t => {
  const [{ JSDOM }, { createServer }, React] = await Promise.all([import("jsdom"), import("vite"), import("react")])
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true }), w = dom.window, previous = new Map()
  for (const [key, value] of Object.entries({ window: w, document: w.document, navigator: w.navigator, HTMLElement: w.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const server = await createServer({ cacheDir: "node_modules/.vite-tests/" + process.pid, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { createRoot } = await import("react-dom/client"), root = createRoot(document.getElementById("root"))
  t.after(async () => { await React.act(() => root.unmount()); await server.close(); dom.window.close(); for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key] })
  const { AccountForm } = await server.ssrLoadModule("/src/panels.tsx")
  const state = emptyState(), account = person("five", 5), saved = []
  state.accounts = [account]
  await React.act(() => root.render(React.createElement(AccountForm, { state, account, onClose() {}, onSave: value => saved.push(value) })))
  const control = document.querySelector('[aria-label="Residential experience (years)"]')
  const enter = async value => React.act(() => { Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, "value").set.call(control, value); control.dispatchEvent(new w.Event("input", { bubbles: true })) })
  const submit = () => React.act(async () => { document.querySelector("form").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true })) })
  await enter("7.5"); await submit()
  assert.equal(saved.length, 0); assert.match(document.body.textContent, /whole years/)
  await enter("7"); await submit()
  assert.equal(saved.length, 1); assert.deepEqual(saved[0].experienceByType, { Residential: { months: 84 } })
  const months = document.querySelector('[aria-label="Residential experience (months)"]')
  const enterMonths = value => React.act(() => { Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,"value").set.call(months,value);months.dispatchEvent(new w.Event('input',{bubbles:true})) })
  await enter('0'); await enterMonths('6'); await submit()
  assert.deepEqual(saved.at(-1).experienceByType,{Residential:{months:6}})
  await enterMonths('12'); await submit()
  assert.equal(saved.length,2,'Month input cannot silently roll over invalid values')
  await enterMonths(''); await enter(''); await submit()
  assert.deepEqual(saved.at(-1).experienceByType,{},'Clearing both fields preserves unknown experience, rather than writing zero')
  await enter('0'); await enterMonths('0'); await submit()
  assert.deepEqual(saved.at(-1).experienceByType,{Residential:{months:0}},'Zero experience is explicitly recorded')
  assert.ok(![...document.querySelectorAll("label")].some(label => /r[eé]sum[eé]/i.test(label.textContent)))
})

test('month-level experience remains precise in profiles and frontend recommendations',()=>{
  assert.deepEqual(normalizeExperience({Residential:{months:6}}),{Residential:{months:6}})
  assert.equal(experienceMonths({Residential:2},'Residential'),24)
  assert.equal(experienceYears({Residential:{months:27}},'Residential'),2.25)
  assert.equal(experienceText({Residential:{months:27}},'Residential'),'2 years, 3 months in Residential')
  assert.equal(experienceText({Residential:{months:6}},'Residential'),'6 months in Residential')
  for(const value of [-1,1.5,961,'6',null]) assert.throws(()=>normalizeExperience({Residential:{months:value}}))
  const state=emptyState(),less=person('less',0),more=person('more',0)
  less.experienceByType={Residential:{months:5}};more.experienceByType={Residential:{months:6}}
  state.accounts=[less,more]
  assert.deepEqual(spmCandidates(state,'Residential','Structure').map(c=>c.account.id),['more','less'])
  more.assignmentHold=true
  assert.deepEqual(spmCandidates(state,'Residential','Structure').map(c=>c.account.id),['less'])
})

import test from "node:test"
import assert from "node:assert/strict"
import { emptyState } from "../src/model.ts"

test("SPM and OPM credentials default to pending and require explicit supported Admin review to verify", async t => {
  const [{ JSDOM }, { createServer }, React] = await Promise.all([import("jsdom"), import("vite"), import("react")])
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" }), w = dom.window, previous = new Map()
  for (const [key, value] of Object.entries({ window: w, document: w.document, navigator: w.navigator, HTMLElement: w.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async () => new Response(JSON.stringify({ data: { download_url: "/files/test" } }), { status: 200 }),
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { createRoot } = await import("react-dom/client"), root = createRoot(document.getElementById("root"))
  t.after(async () => { await React.act(() => root.unmount()); await server.close(); w.close(); for (const [k, d] of previous) d ? Object.defineProperty(globalThis, k, d) : delete globalThis[k] })
  const { AccountForm } = await server.ssrLoadModule("/src/panels.tsx")
  const field = text => document.querySelector(`input[aria-label="${text}"]`) || document.getElementById([...document.querySelectorAll("label")].find(l => l.textContent === text)?.htmlFor || "")
  const enter = (label, value) => React.act(() => {
    const element = field(label); assert.ok(element, label)
    const proto = element.tagName === "SELECT" ? w.HTMLSelectElement.prototype : element.tagName === "TEXTAREA" ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, "value").set.call(element, value)
    element.dispatchEvent(new w.Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }))
  })
  const click = text => React.act(() => { const b = [...document.querySelectorAll("button")].find(b => b.textContent.trim() === text); assert.ok(b, text); b.click() })
  const submit = () => React.act(async () => { document.querySelector("form").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true })) })
  for (const role of ["spm", "opm"]) {
    const saved = []
    await React.act(() => root.render(React.createElement(AccountForm, { key: role, state: emptyState(), onClose() {}, onSave: value => saved.push(value) })))
    await enter("Account role", role)
    const headings = [...document.querySelectorAll("form h3")].map(h => h.textContent)
    const licenseIndex = headings.indexOf("Professional license details")
    const specializationIndex = headings.findIndex(h => h.includes(role === "spm" ? "Areas of specialization" : "Project specialization"))
    assert.ok(licenseIndex>=0);if(role==='opm')assert.ok(licenseIndex<specializationIndex);else assert.ok(document.querySelector('.credential-record .credential-specializations'))
    assert.ok(headings.indexOf("Admin verification") > headings.indexOf("Project experience"))
    assert.equal(field('Credential decision'),null,'Account creation must not offer pending versus verified decisions')
    await enter("First name *", "Juan"); await enter("Last name *", "Cruz")
    await enter("Residential experience (years)", "0")
    await click(role === "spm" ? "Civil" : "Residential")
    const choice = text => [...document.querySelectorAll('.account-choice-chips button')].find(button=>button.textContent.trim()===text)
    assert.equal(choice(role==='spm'?'Civil':'Residential').getAttribute('aria-pressed'),'true')
    if(role==='spm') {
      await click('Structural'); await click('Geotechnical'); await click('Mechanical')
      assert.equal(choice('Mechanical').getAttribute('aria-pressed'),'false','The three-specialization limit is preserved')
      await click('Structural'); await click('Geotechnical')
    }
    await submit(); assert.equal(saved.length, 0)
    await enter("Licensed profession *", "Civil Engineer")
    await enter("License number exactly as printed *", "0001234")
    await enter("Expiry date *", "2099-01-01")
    const file = document.querySelector('input[type="file"]')
    assert.equal(file.hidden,true,'The native Choose File / No file chosen control is hidden')
    assert.ok(field('Supporting credential document *')===file,'Visible field label remains associated with the upload input')
    let pickerOpened=0
    file.click=()=>pickerOpened++
    await click('Upload Credential')
    assert.equal(pickerOpened,1,'The explicit upload button opens the file picker')
    Object.defineProperty(file, "files", { value: [new File(["%PDF-1.4"], "credential.pdf", { type: "application/pdf" })], configurable: true })
    await React.act(async () => { file.dispatchEvent(new w.Event("change", { bubbles: true })); await new Promise(r => setTimeout(r, 20)) })
    assert.match(document.querySelector('.credential-file-status').textContent,/credential.pdf/)
    assert.ok([...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Replace File'))
    await submit()
    assert.equal(saved.length, 1);assert.equal(saved[0].credentialDecision,'pending','Uploading and saving do not automatically verify credentials');saved.length=0
    await React.act(() => document.querySelector('input[type="checkbox"]').click())
    await submit(); assert.equal(saved.length,0,'A review note is still required')
    await enter("Verification note *", "Reviewed supporting evidence.")
    await submit(); assert.equal(saved.length,1)
    assert.equal(saved[0].credentialDecision,'verified')
    assert.equal(saved[0].initialCredentials[0].license_number, '0001234')
    assert.ok(saved[0].initialCredentials[0].file_id)
    assert.deepEqual(role === 'spm' ? saved[0].scope : saved[0].projectTypes,[role === 'spm' ? 'Civil' : 'Residential'])
    await submit(); assert.equal(saved.length, 2)
    assert.equal(saved[1].credentialDecision, "verified")
    assert.equal(saved[1].initialCredentials[0].file_id, saved[0].initialCredentials[0].file_id, "no duplicate upload")
    await click('Add another professional credential')
    assert.equal(document.querySelectorAll('.registration-credential-heading').length,2)
    const remove=document.querySelector('[aria-label="Remove credential 2"]')
    assert.ok(remove.closest('.registration-credential-heading'),'Removal action belongs in the credential card header')
    await React.act(()=>remove.click());await click('Remove this credential')
    assert.equal(document.querySelectorAll('.registration-credential-heading').length,1)
    assert.match(document.querySelector('.credential-file-status').textContent,/credential.pdf/,'Removing another credential preserves the retained attachment')
  }
  const {default:Credentials}=await server.ssrLoadModule('/src/RegistrationCredentials.tsx')
  let current
  function IndependentCards(){const [value,setValue]=React.useState({initialCredentials:[{clientKey:'first',profession:'Civil Engineer',license_number:'0012345',license_expiry:'2099-01-01',file_id:'first-file',fileName:'civil.pdf',specializations:[]}]});current=value;return React.createElement(Credentials,{value,onChange:setValue,onBusy(){},onError(){}})}
  await React.act(()=>root.render(React.createElement(IndependentCards)))
  const card=index=>document.querySelectorAll('.registration-credentials .credential-record')[index]
  const toggle=async(index,tag)=>React.act(()=>[...card(index).querySelectorAll('.chip')].find(b=>b.textContent===tag).click())
  for(const tag of ['Civil','Structural','Geotechnical'])await toggle(0,tag)
  await toggle(0,'Mechanical');assert.equal(current.initialCredentials[0].specializations.length,3)
  await click('Add another professional credential')
  for(const tag of ['Mechanical','Fire Protection','Acoustic'])await toggle(1,tag)
  assert.deepEqual(current.initialCredentials.map(c=>c.specializations.length),[3,3])
  assert.equal(current.initialCredentials[0].license_number,'0012345');assert.equal(current.initialCredentials[0].file_id,'first-file')
  await toggle(0,'Structural');await toggle(0,'Acoustic')
  assert.ok(current.initialCredentials.every(c=>c.specializations.includes('Acoustic')),'the same specialization can belong to different credentials')
  await click('Add another professional credential')
  for(const tag of ['Electrical','Electronics','Surveying'])await toggle(2,tag)
  assert.deepEqual(current.initialCredentials.map(c=>c.specializations.length),[3,3,3])
  await click('Collapse credential 1');assert.equal(card(0).querySelector('[id="credential-first"]').hidden,true)
  await click('Expand credential 1');assert.equal(card(0).querySelector('[id="credential-first"]').hidden,false)
  await React.act(()=>card(1).querySelector('[aria-label="Remove credential 2"]').click())
  await click('Keep credential');assert.equal(current.initialCredentials.length,3)
  await React.act(()=>card(1).querySelector('[aria-label="Remove credential 2"]').click());await click('Remove this credential')
  assert.equal(current.initialCredentials.length,2)
  assert.equal(current.initialCredentials[0].license_number,'0012345')
  assert.deepEqual(current.initialCredentials[1].specializations,['Electrical','Electronics','Surveying'])
})

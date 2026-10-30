import {readFileSync,writeFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
const write=(p,s)=>writeFileSync(p,s)
let source=execFileSync('git',['show','HEAD:src/panels.tsx'],{encoding:'utf8'}).replace(/\r\n/g,'\n')
const companyStart=source.indexOf('export function CompanyForm')
const fieldsStart=source.indexOf('      <div className="form-grid">',companyStart)
const fieldsEnd=source.indexOf('      {role === "spm"',fieldsStart)
const fields=source.slice(fieldsStart,fieldsEnd)
write('src/CompanyRegistrationFields.tsx',`import { Field } from "./ui"\nimport type { Company } from "./model"\nimport { COMPANY_EMAIL_PATTERN, COMPANY_PHONE_PATTERN, type CompanyRegistrationErrors } from "../Thesis-Backend/src/domain/company-registration.js"\nimport "./company-foremen.css"\nexport default function CompanyRegistrationFields({draft, patch, fieldErrors = {}, busy = false}: {draft: Pick<Company,"name"|"email"|"foremen">; patch: (values: Partial<Company>) => void; fieldErrors?: CompanyRegistrationErrors; busy?: boolean}) {\nconst patchForeman=(index:number, values: Partial<{name:string;phone:string}>)=>{const foremen=(draft.foremen || [{name:"",phone:""},{name:"",phone:""}]).map((foreman,position)=>position===index?{...foreman,...values}:foreman);patch({foremen,contact:foremen[0].name,phone:foremen[0].phone})}\nreturn <>\n${fields}</>\n}\n`)
source=source.slice(0,fieldsStart)+'      <CompanyRegistrationFields draft={draft} patch={patch} fieldErrors={fieldErrors} busy={busy} />\n'+source.slice(fieldsEnd)
source='import CompanyRegistrationFields from "./CompanyRegistrationFields"\n'+source
source=source.replace('  const [agreementPreview, setAgreementPreview] = useState<Doc>()','')
const ownStart=source.indexOf('    if (ownSubcon) {',source.indexOf('export function IntakeForm'))
const ownEnd=source.indexOf('\n    if (\n      !opmCandidates',ownStart)
source=source.slice(0,ownStart)+`    if (ownSubcon && (!project || draft.clientSubconCompany)) {
      const errors = companyRegistrationErrors(clientCompany)
      if (Object.keys(errors).length) err = Object.values(errors)[0] as string
    }
`+source.slice(ownEnd)
source=source.replace('        clientSubcon: ownSubcon ? draft.clientSubcon?.trim() : undefined,','        clientSubconCompany: ownSubcon ? { ...clientCompany, foremen: normalizeCompanyForemen(clientCompany), name: clientCompany.name.trim(), email: clientCompany.email.trim().toLowerCase() } : undefined,\n        clientSubcon: ownSubcon ? clientCompany.name.trim() : undefined,')
source=source.replace('? draft.clientSubconEmail?.trim()','? clientCompany.email.trim().toLowerCase()')
const oldConst=source.indexOf('  const clientSubconAgreement = draft.docs.find(')
const constEnd=source.indexOf('  const projectTypeError',oldConst)
source=source.slice(0,oldConst)+`  const clientCompany = draft.clientSubconCompany || { name: draft.clientSubcon || "", email: draft.clientSubconEmail || "", foremen: [{ name: "", phone: "" }, { name: "", phone: "" }], contact: "", phone: "", note: "", availability: "available" as const, documents: [] as Doc[] }
  const patchClientCompany = (values: Partial<Company>) => patch({ clientSubconCompany: { ...clientCompany, ...values }, clientSubcon: values.name ?? clientCompany.name, clientSubconEmail: values.email ?? clientCompany.email })
`+source.slice(constEnd)
const uiStart=source.indexOf('              <div className="subcontractor-agreement">',source.indexOf('Client has their own subcontractor'))
const uiEnd=source.indexOf('\n            )}',uiStart)
source=source.slice(0,uiStart)+`              <div className="subcontractor-agreement">
                <CompanyRegistrationFields draft={clientCompany} patch={patchClientCompany} busy={!!project || submitting} />
                <div className="form-grid">
                  <Field label="Company availability" hint="This company is reserved for this project after submission."><input readOnly value="Available" /></Field>
                  <Field label="Company notes" wide><textarea disabled={!!project || submitting} value={clientCompany.note} onChange={event => patchClientCompany({ note: event.target.value })} /></Field>
                </div>
                <section className="form-section"><h3>Supporting documents</h3>
                  <DocumentList docs={clientCompany.documents} onPreview={() => undefined} />
                  {!project && <Upload label="Company Supporting Document" disabled={submitting} onSave={document => patchClientCompany({ documents: [...clientCompany.documents, document] })} />}
                </section>
                <p>This company is locked to the project after submission.</p>
              </div>`+source.slice(uiEnd)
const prevStart=source.indexOf('      {agreementPreview && (')
if(prevStart!==-1){const prevEnd=source.indexOf('\n      )}',prevStart)+9;source=source.slice(0,prevStart)+source.slice(prevEnd)}
write('src/panels.tsx',source)
let model=execFileSync('git',['show','HEAD:src/model.ts'],{encoding:'utf8'}).replace('  clientSubconEmail?: string','  clientSubconCompany?: Pick<Company, "name" | "email" | "foremen" | "contact" | "phone" | "note" | "availability" | "documents">\n  clientSubconEmail?: string');write('src/model.ts',model)

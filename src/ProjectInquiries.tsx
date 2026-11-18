import { useEffect, useState, type FormEvent } from "react"
import { api } from "./api/client"
import { uploadFile } from "./api/actions"
import { Icon } from "./ui"
import "./project-inquiries.css"

const projectTypes = [
  ["Residential", "home", "Houses, condominiums, apartments, and residential buildings."],
  ["Commercial", "building", "Offices, retail spaces, hotels, and business establishments."],
  ["Mixed-Use", "mixed-building", "Developments combining residential and commercial spaces."],
] as const
const fields = [
  ["client_name", "Client name", "text"], ["email", "Email", "email"], ["phone", "Phone", "tel"],
  ["name", "Project name", "text"], ["address", "Project address", "text"],
  ["land_area", "Land area (m²)", "number"], ["lot_area", "Lot area (m²)", "number"],
  ["floor_area_sqm", "Total floor area (m²)", "number"], ["floor_count", "Number of floors", "number"],
] as const
type Details = Record<string, string | number>
type Inquiry = { id: string; details: Details; status: string; opm_id?: string; opm_name?: string; reason?: string; project_status?: string }
type Candidate = { id: string; name: string; qualifiedTags: string[] }
type Engineer = { user_id: string; assigned_disciplines: string[] }
type Phase = { stage: string; user_id: string | null; assigned_disciplines?: string[]; engineers?: Engineer[] }
type Planning = { phases: string[]; estimate: { size: string | null; end: string | null }; team?: Phase[]; candidates?: Record<string, Candidate[]> }
type Recommendation = { id: string; full_name: string; experience_years: number; availability: string; active_projects?: number }
const timing = [[30, "30 minutes"], [60, "1 hour"], [1440, "1 day"]] as const
const statuses: Record<string,string> = {
  draft: "Ready for routing", offered: "Awaiting OPM response", returned: "Returned to Admin",
  consulting: "Awaiting client decision", approved: "Ready for project intake", withdrawn: "Client withdrew",
  dropped: "Dropped", converted: "Project intake complete",
}

const statusLabel = (row: Inquiry) => row.project_status === "spm_review" ? "Staffing in progress" : statuses[row.status]

const post = <T,>(path: string, json: unknown) => api<T>(path, { method: "POST", json })

function InquiryFields({ details, onChange }: { details: Details; onChange: (key: string, value: string | number) => void }) {
  return <>
    <div className="inquiry-fields">
      {fields.map(([key, label, type]) => <label key={key}>{label}
        <input type={type} required value={details[key] ?? ""} min={type === "number" ? key === "floor_count" ? 1 : 0.01 : undefined}
          step={type === "number" ? key === "floor_count" ? 1 : "any" : undefined}
          onChange={event => onChange(key,event.target.value)} />
      </label>)}
    </div>
    <fieldset><legend>Project type</legend><div className="inquiry-types">
      {projectTypes.map(([type, icon, description]) => <label key={type} className={details.project_type === type ? "selected" : ""}>
        <input type="radio" name="project-type" required checked={details.project_type === type} onChange={() => onChange("project_type",type)} />
        <Icon name={icon} /><strong>{type}</strong><span>{description}</span>
      </label>)}
    </div></fieldset>
  </>
}

export default function ProjectInquiries({ role, onReload }: { role: "admin" | "opm"; onReload: () => unknown }) {
  const [rows, setRows] = useState<Inquiry[]>([])
  const [selected, setSelected] = useState("")
  const [details, setDetails] = useState<Details>({ consultation: 30 })
  const [recommendation, setRecommendation] = useState<Recommendation | null>()
  const [planning, setPlanning] = useState<Planning>()
  const [phases, setPhases] = useState<string[]>([])
  const [team, setTeam] = useState<Phase[]>([])
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [budget, setBudget] = useState("")
  const [reason, setReason] = useState("")
  const [withdrawing, setWithdrawing] = useState(false)
  const [contract, setContract] = useState<File>()
  const [plans, setPlans] = useState<File>()
  const [uploads, setUploads] = useState<{ contract?: string; plans?: string }>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const row = rows.find(item => item.id === selected)
  const root = "/projects/inquiries"
  const change = (key: string, value: string | number) => {
    setDetails(previous => ({ ...previous, [key]: value }))
    setPlanning(undefined)
    setTeam([])
  }
  const refresh = async () => setRows(await api<Inquiry[]>(root))
  useEffect(() => {
    let mounted = true
    void api<Inquiry[]>(root).then(data => { if (mounted) setRows(data) }, e => { if (mounted) setError(String(e.message)) })
    return () => { mounted = false }
  }, [])
  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError("")
    try { await action() }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }
  function open(item?: Inquiry) {
    setSelected(item?.id || "")
    setDetails(item ? { ...item.details } : { consultation: 30 })
    setRecommendation(undefined)
    setPlanning(undefined)
    setTeam([])
    setPhases([])
    setReason("")
    setWithdrawing(false)
    setStart("")
    setEnd("")
    setBudget("")
    setContract(undefined)
    setPlans(undefined)
    setUploads({})
  }
  async function recommend(id: string) {
    const result = await api<Recommendation | { data: null }>(`${root}/${id}/recommendation`)
    setRecommendation("id" in result ? result : null)
  }
  async function decision(action: string) {
    await post(`${root}/${selected}/decision`, { action, reason, opm_id: recommendation?.id })
    setWithdrawing(false)
    setRecommendation(undefined)
    await refresh()
    void onReload()
  }
  async function intakePreview(event: FormEvent) {
    event.preventDefault()
    await run(async () => {
      const result = await post<Planning>(`${root}/${selected}/planning`, { ...details, target_start_date: start })
      setPlanning(result)
      setTeam([])
      setPhases(result.phases)
      if (!end && result.estimate.end) setEnd(result.estimate.end)
    })
  }
  async function allocate() {
    const saved = await uploadIntakeDocuments();
    const result = await post<Planning>(`${root}/${selected}/planning`, { ...details, target_start_date: start, target_end_date: end, phases, estimated_budget: budget, contract_file_id: saved.contract })
    setPlanning(result)
    setTeam(result.team || [])
  }
  function addEngineer(stage: string, candidate: Candidate) {
    setTeam(previous => {
      const existing = previous.find(item => item.stage === stage)
      const usedTags = new Set(existing?.engineers?.flatMap(person => person.assigned_disciplines));
      const freeTags = candidate.qualifiedTags.filter(tag => !usedTags.has(tag)).slice(0,3);
      if (existing?.engineers && (!freeTags.length || existing.engineers.length >= 3)) return previous;
      if (!existing?.user_id) {
        const entry = { stage, user_id: candidate.id, assigned_disciplines: candidate.qualifiedTags.slice(0, 1),
          ...(existing?.engineers ? { engineers: [{user_id:candidate.id,assigned_disciplines:freeTags}] } : {}) }
        return [...previous.filter(item => item.stage !== stage), entry]
      }
      if (!existing.engineers || existing.engineers.some(person => person.user_id === candidate.id)) return previous
      return previous.map(item => item.stage === stage ? {
        ...item, engineers: [...existing.engineers!, { user_id: candidate.id, assigned_disciplines: freeTags }],
      } : item)
    })
  }
  async function uploadIntakeDocuments() {
    const saved = { ...uploads }
    if (!saved.contract && contract) {
      const id = crypto.randomUUID()
      await uploadFile(id, contract)
      saved.contract = id
      setUploads({ ...saved })
    }
    if (!saved.plans && plans) {
      const id = crypto.randomUUID()
      await uploadFile(id, plans)
      saved.plans = id
      setUploads({ ...saved })
    }
    return saved
  }
  async function submit() {
    const saved = await uploadIntakeDocuments()
    await post("/projects/intake", {
      ...details, inquiry_id: selected, suggested_opm_id: row?.opm_id, target_start_date: start,
      target_end_date: end, estimated_budget: budget, contract_file_id: saved.contract,
      plans_file_id: saved.plans, phases, phase_team: phases.map(stage => team.find(item => item.stage === stage)),
    })
    await refresh()
    void onReload()
  }
  const canSend = !!contract && !!start && !!end && end >= start && Number(budget) > 0 &&
    phases.length > 0 && phases.every(stage => team.some(item => item.stage === stage && item.user_id))
  return <section className="project-inquiries">
    <header><h1>Project inquiries</h1><button className="button" disabled={busy} onClick={() => void run(refresh)}>Refresh</button>
      {role === "admin" && <button className="button primary" disabled={busy} onClick={() => open()}>New inquiry</button>}
    </header>
    <div className="inquiry-list">
      {rows.map(item => <button type="button" key={item.id} disabled={busy} aria-pressed={item.id === selected} onClick={() => open(item)}>
        <strong>{item.details.name}</strong><span>{statusLabel(item)}</span>
      </button>)}
      {!rows.length && role === "opm" && <p>No consultation requests.</p>}
    </div>
    <fieldset disabled={busy} className="inquiry-body">
      {role === "admin" && !row && <form onSubmit={event => {
        event.preventDefault()
        void run(async () => {
          const result = await post<Inquiry>(root, details)
          await refresh()
          open(result)
          await recommend(result.id)
        })
      }}>
        <h2>New project inquiry</h2>
        <InquiryFields details={details} onChange={change} />
        <label>Preferred consultation timing<select value={details.consultation} onChange={event => change("consultation", Number(event.target.value))}>
          {timing.map(([value,label]) => <option value={value} key={value}>{label}</option>)}
        </select></label>
        <button className="button primary">Find OPM</button>
      </form>}
      {row && <div className="inquiry-record">
        <h2>{row.details.name}</h2><p>{statusLabel(row)}</p>
        {row.opm_name && <p>Office Project Manager: {row.opm_name}</p>}
        {row.reason && <p>Withdrawal reason: {row.reason}</p>}
        {(role === "admin" || row.status !== "approved") && <dl className="inquiry-fields">
          {[...fields, ["project_type","Project type"]].map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{row.details[key]}</dd></div>)}
          <div><dt>Preferred consultation timing</dt><dd>{timing.find(([value]) => value === row.details.consultation)?.[1]}</dd></div>
        </dl>}
        {role === "admin" && ["draft","returned"].includes(row.status) && <>
          <button className="button" onClick={() => void run(() => recommend(row.id))}>Find OPM</button>
          {recommendation === null && <p>No eligible Office Project Manager is currently available.</p>}
          {recommendation && <div className="inquiry-card"><h3>{recommendation.full_name}</h3><p>Office Project Manager</p>
            <p>{row.details.project_type} specialization · {recommendation.experience_years ?? 0} years of relevant experience · {recommendation.availability}</p>
            <p>{recommendation.active_projects ?? 0} active projects</p>
            <button className="button primary" onClick={() => void run(() => decision("send"))}>Send consultation request</button>
          </div>}
        </>}
        {role === "admin" && row.status === "withdrawn" && <button className="button" onClick={() => void run(() => decision("drop"))}>Mark inquiry dropped</button>}
        {role === "opm" && row.status === "offered" && <div className="inquiry-actions">
          <button className="button" onClick={() => void run(() => decision("cancel"))}>Cancel and return to Admin</button>
          <button className="button primary" onClick={() => void run(() => decision("confirm"))}>Confirm consultation</button>
        </div>}
        {role === "opm" && row.status === "consulting" && <>
          <p>Contact the client to discuss the project. Keep the inquiry open while the client considers revised options.</p>
          <div className="inquiry-actions">
            <button className="button" onClick={() => setWithdrawing(true)}>Drop project</button>
            <button className="button primary" onClick={() => void run(() => decision("approve"))}>Proceed to project intake</button>
          </div>
          {withdrawing && <form onSubmit={event => { event.preventDefault(); void run(() => decision("withdraw")) }}>
            <label>Client withdrawal reason<textarea required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>
            <button className="button" type="button" onClick={() => setWithdrawing(false)}>Back</button>
            <button className="button primary">Record withdrawal</button>
          </form>}
        </>}
        {role === "opm" && row.status === "approved" && <>
          <form onSubmit={intakePreview}>
            <h3>Project intake</h3>
            <InquiryFields details={details} onChange={change} />
            <div className="inquiry-fields">
              <label>Target start date<input type="date" required value={start} onChange={event => { setStart(event.target.value); setPlanning(undefined); setTeam([]) }} /></label>
              <label>Overall end date<input type="date" min={start} value={end} onChange={event => { setEnd(event.target.value); setTeam([]); setPlanning(previous => previous && ({...previous,candidates:undefined})) }} /></label>
              <label>Estimated budget (₱)<input type="number" min="0.01" step="0.01" required value={budget} onChange={event => { setBudget(event.target.value); setTeam([]); setPlanning(previous => previous && ({...previous,candidates:undefined})) }} /></label>
              <label>Signed Client Contract Agreement<input type="file" accept=".pdf,.png,.jpg,.jpeg" required onChange={event => { setContract(event.target.files?.[0]); setTeam([]); setPlanning(previous => previous && ({...previous,candidates:undefined})); setUploads(previous => ({...previous,contract:undefined})) }} /></label>
              <label>Registered plans<input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={event => { setPlans(event.target.files?.[0]); setUploads(previous => ({...previous,plans:undefined})) }} /></label>
            </div>
            <button className="button primary">Review project size and phases</button>
          </form>
          {planning && <section className="inquiry-card">
            <p>Suggested project size: {planning.estimate.size || "Unavailable"}</p>
            <p>Suggested overall end date: {planning.estimate.end || "Unavailable. Enter the end date above."}</p>
            {planning.estimate.end && <button className="button" onClick={() => { setEnd(planning.estimate.end || ""); setTeam([]); setPlanning({...planning,candidates:undefined}) }}>Use suggested date</button>}
            <h3>Construction phases</h3>
            {planning.phases.map(stage => <label className="inquiry-check" key={stage}>
              <input type="checkbox" checked={phases.includes(stage)} onChange={event => {
                setPhases(previous => event.target.checked ? planning.phases.filter(item => item === stage || previous.includes(item)) : previous.filter(item => item !== stage))
                setTeam([])
                setPlanning({ ...planning, candidates: undefined })
              }} />{stage}
            </label>)}
            <button className="button primary" disabled={!contract || !start || !end || end < start || !Number(budget) || !phases.length} onClick={() => void run(allocate)}>Auto-allocate SPMs</button>
            {planning.candidates && <section>
              <h3>Recommended SPM lineup</h3>
              {phases.map((stage,index) => {
                const entry = team.find(item => item.stage === stage)
                const choices = planning.candidates?.[stage] || []
                const engineers = entry?.engineers || (entry?.user_id ? [{ user_id: entry.user_id, assigned_disciplines: entry.assigned_disciplines || [] }] : [])
                return <div className="inquiry-card" key={stage}>
                  <strong>{stage}</strong>
                  {!engineers.length && <p>Unfilled</p>}
                  {engineers.map(person => <p key={person.user_id}>{choices.find(candidate => candidate.id === person.user_id)?.name || "Site PM"} · {index === 0 && person.user_id === entry?.user_id ? "Lead SPM" : "Phase SPM"} · Available · {person.assigned_disciplines.join(", ")}</p>)}
                  <label>{entry?.user_id && !entry.engineers ? "Change SPM" : "Add SPM to phase"}
                    <select value="" onChange={event => {
                      const candidate = choices.find(item => item.id === event.target.value)
                      if (!candidate) return
                      if (entry?.user_id && !entry.engineers)
                        setTeam(previous => previous.map(item => item.stage === stage ? { ...item, user_id:candidate.id, assigned_disciplines:candidate.qualifiedTags.slice(0,1) } : item))
                      else addEngineer(stage,candidate)
                    }}><option value="">Select an eligible SPM</option>
                      {choices.filter(candidate => !engineers.some(person => person.user_id === candidate.id) && (!entry?.engineers || (engineers.length < 3 && candidate.qualifiedTags.some(tag => !engineers.some(person => person.assigned_disciplines.includes(tag)))))).map(candidate =>
                        <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.qualifiedTags.join(", ")}</option>)}
                    </select>
                  </label>
                </div>
              })}
              <button className="button primary" disabled={!canSend} onClick={() => void run(submit)}>Send assignment offers</button>
            </section>}
          </section>}
        </>}
      </div>}
    </fieldset>
    {busy && <p role="status">Saving or loading inquiry…</p>}
    {error && <p role="alert">{error}</p>}
  </section>
}

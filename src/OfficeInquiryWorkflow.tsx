import { useEffect, useRef, useState, type ReactNode } from "react"
import { Icon } from "./ui"
import DatePicker from "./DatePicker"
import { arrangementOptions, assessInquiry, technicalOptions } from "../Thesis-Backend/src/domain/inquiry-assessment.js"

export type OfficePage = "pending" | "received" | "accepted" | "proposal" | "review" | "assessment"
type Details = Record<string, string | number>
type ReviewEvent = { at: string; version: number; reason: string; changes: Record<string, { before: string | number | null; after: string | number | null }> }
export type OfficeWorkflow = {
  review?: { version: number; start: string; end: string; estimate: { size: string | null; end: string | null } }
  review_history?: ReviewEvent[]
  budget?: number
  budget_history?: { at: string; amount: number }[]
  revisions?: { date: string; note: string }[]
  assessment?: ReturnType<typeof assessInquiry> & { id: string; completed_at: string }
}
export type OfficeRecord = {
  details: Details; workflow?: OfficeWorkflow; status: string; opm_name?: string;
  match?: { experience_years?: number; project_type: string };
}
type Props = {
  row: OfficeRecord; page: OfficePage; reference: string; consultation: string; busy: boolean; error: string; pendingCount: number;
  navigate: (page: OfficePage) => void; back: () => void; startStaffing: () => void;
  decide: (action: string, input?: Record<string, string>) => void;
  save: (action: string, input: Record<string, unknown>) => void;
}

const clientFields = [["client_name", "Client name"], ["phone", "Contact number"], ["email", "Email address"]] as const
const projectFields = [
  ["name", "Project name"], ["project_type", "Project type"], ["land_area", "Land area (m²)"],
  ["lot_area", "Lot area (m²)"], ["floor_area_sqm", "Total floor area (m²)"],
  ["floor_count", "Number of floors"], ["address", "Project address / location"],
] as const
const currency = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" })
const date = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" })
const today = () => new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeZone: "Asia/Manila" }).format(new Date())
const formatDay = (value: string) => date.format(new Date(value))
const amount = (value: string | number | undefined) => value ?? "Not provided"

function Card({ title, icon, children }: { title: string; icon?: string; children: ReactNode }) {
  return <section className="inquiry-card office-workflow-card">
    <header className="inquiry-section-heading">
      {icon && <span className="inquiry-list-icon"><Icon name={icon} /></span>}
      <h2>{title}</h2>
    </header>
    {children}
  </section>
}

function Facts({ values }: { values: [string, string | number][] }) {
  return <dl className="office-workflow-facts">{values.map(([label, value]) =>
    <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
}

function Notice({ tone = "", children }: { tone?: string; children: ReactNode }) {
  return <div className={`office-workflow-notice ${tone}`}>
    <Icon name={tone === "success" ? "check" : tone === "warning" ? "clock" : "doc"} />
    <div>{children}</div>
  </div>
}

export default function OfficeInquiryWorkflow({ row, page, reference, consultation, busy, error, pendingCount, navigate, back, startStaffing, decide, save }: Props) {
  const workflow = row.workflow
  const review = workflow?.review
  const assessment = workflow?.assessment
  const heading = useRef<HTMLHeadingElement>(null)
  const budgetField = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(row.details)
  const [start, setStart] = useState(review?.start ?? String(row.details.anticipated_start ?? ""))
  const [end, setEnd] = useState(review?.end ?? "")
  const [reason, setReason] = useState("")
  const [budget, setBudget] = useState(String(workflow?.budget ?? ""))
  const [technical, setTechnical] = useState(assessment?.technical ?? technicalOptions[0])
  const [arrangement, setArrangement] = useState(assessment?.arrangement ?? arrangementOptions[0])
  const [decisionDate, setDecisionDate] = useState(today)
  const [note, setNote] = useState("")
  const [proposalAction, setProposalAction] = useState<"revise" | "withdraw">()
  useEffect(() => { heading.current?.focus() }, [])
  useEffect(() => {
    if (review) {
      setEditing(false)
      setReason("")
    }
  }, [review?.version])
  useEffect(() => {
    setProposalAction(undefined)
    setNote("")
    setReason("")
  }, [workflow?.revisions?.length])

  const name = String(row.details.name || "Project inquiry")
  const accepted = row.status === "approved"
  const title = {
    pending: "Pending inquiry", received: pendingCount ? "Inquiry accepted" : "No pending inquiries", accepted: name,
    proposal: "Client proposal", review: "Review and edit project information", assessment: "Assess project size, complexity, and duration",
  }[page]
  const descriptions = {
    pending: "Review the system recommendation. Rejected inquiries advance to the next eligible Office PM.",
    received: `${name} is now in your accepted inquiries.`,
    accepted: "Review the client and project information submitted with this inquiry.",
    proposal: "Record the outcome of the proposal discussed with the client.",
    review: "Confirm the project record or save corrections with a reason before entering the approved budget.",
    assessment: "Use the reviewed project record to assess size, complexity, and duration before staffing.",
  }
  const clientFacts: [string, string | number][] = clientFields.map(([key, label]) => [label, amount(row.details[key])])
  if (row.details.primary_contact) clientFacts.push(["Primary contact", row.details.primary_contact])
  const projectFacts: [string, string | number][] = [
    ...projectFields.filter(([key]) => key !== "name").map(([key, label]): [string, string | number] => [label, amount(row.details[key])]),
    ["Estimated start", review ? formatDay(review.start) : row.details.anticipated_start ? formatDay(String(row.details.anticipated_start)) : "Not provided"],
    ["Estimated completion", review ? formatDay(review.end) : "Not provided"],
    ["Classification", row.details.classification || "Normal"],
  ]
  const preview = review && (assessment ?? assessInquiry(row.details, review.estimate, review.start, review.end, technical, arrangement))
  const editField = (key: string, label: string) => {
    const numeric = /^(land_area|lot_area|floor_area_sqm|floor_count)$/.test(key)
    return <label key={key}>{label}{key === "project_type"
      ? <select required value={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value })}>
        {["Residential", "Commercial", "Mixed-Use"].map(type => <option key={type}>{type}</option>)}
      </select>
      : <input type={numeric ? "number" : key === "email" ? "email" : key === "phone" ? "tel" : "text"}
          min={numeric ? key === "floor_count" ? 1 : 0.01 : undefined} step={numeric ? key === "floor_count" ? 1 : "any" : undefined}
          required={key !== "land_area"} value={draft[key] ?? ""} onChange={event => setDraft({ ...draft, [key]: event.target.value })} />}
    </label>
  }
  const recordCards = <div className="office-workflow-grid">
    <Card title="Client information" icon="users"><Facts values={clientFacts} /></Card>
    <Card title="Project information" icon="building"><Facts values={projectFacts} />
      {row.details.overview && <p>{row.details.overview}</p>}
    </Card>
  </div>

  return <div className="office-workflow">
    <button type="button" className="button office-workflow-back" disabled={busy} onClick={back}>← Project inquiries</button>
    {page !== "pending" && page !== "received" && <nav className="office-workflow-nav" aria-label="Inquiry workflow">
      {([["accepted", "Accepted inquiry", true], ["proposal", "Client proposal", true], ["review", "Project information & budget", accepted],
        ["assessment", "Project assessment", accepted && Boolean(workflow?.budget && review)]] as const).map(([key, label, enabled]) =>
        <button type="button" className="button" key={key} disabled={busy || !enabled}
          aria-current={page === key ? "step" : undefined} onClick={() => navigate(key)}>{label}</button>)}
    </nav>}
    <header className="office-workflow-heading">
      <div><p className="inquiry-muted">{reference} · Office PM</p><h1 ref={heading} tabIndex={-1}>{title}</h1><p>{descriptions[page]}</p></div>
      {page === "accepted" && <button type="button" className="button primary" onClick={() => navigate(accepted ? "review" : "proposal")}>
        {accepted ? "Review project information" : "Open proposal"}
      </button>}
      {page === "review" && !editing && <button type="button" className="button" disabled={busy} onClick={() => {
        setDraft(row.details)
        setEditing(true)
      }}>Edit project information</button>}
    </header>
    {error && <p className="office-workflow-error" role="alert">{error}</p>}
    {busy && <p role="status">Saving or loading inquiry…</p>}

    {page === "pending" && <div className="office-workflow-grid">
      <Card title="Recommended Office Project Manager" icon="users">
        <h3>{row.opm_name || "Your Office PM account"}</h3>
        <Facts values={[
          ["Matched project type", row.match?.project_type || row.details.project_type],
          ...(row.match?.experience_years != null ? [["Relevant experience", `${row.match.experience_years} years`] as [string, string]] : []),
          ["Inquiry urgency", row.details.classification || "Normal"],
          ["Preferred consultation timing", consultation],
        ]} />
        {row.match && <Notice><strong>Why this match?</strong><p>The system matched the project type and ranked eligible, available Office PMs by relevant experience.</p></Notice>}
        <div className="office-workflow-actions">
          <button type="button" className="button inquiry-decline" disabled={busy} onClick={() => decide("cancel")}>Reject inquiry</button>
          <button type="button" className="button primary" disabled={busy} onClick={() => decide("confirm")}>Accept inquiry</button>
        </div>
      </Card>
      <Card title="Inquiry summary" icon="building">
        <h3>{name}</h3><Facts values={[...clientFacts, ...projectFacts]} />
        {row.details.overview && <p>{row.details.overview}</p>}
      </Card>
    </div>}

    {page === "received" && <div className="inquiry-card office-workflow-received">
      <span className="inquiry-list-icon"><Icon name="check" /></span>
      <button className="button primary" type="button" onClick={() => navigate("accepted")}>View accepted inquiry</button>
    </div>}

    {page === "accepted" && <>
      <Notice tone={accepted ? "success" : "warning"}>
        <strong>{accepted ? "Client proposal approved" : "Awaiting client proposal approval"}</strong>
        <p>{accepted ? "Review the project information to continue." : "Project information is read-only until the client approves the proposal."}</p>
      </Notice>
      {recordCards}
    </>}

    {(page === "proposal" || page === "review") && <div className="office-workflow-grid">
      <Card title="Client proposal" icon="doc">
        <span className={`inquiry-pill ${accepted ? "ready" : "pending"}`}>{accepted ? "Approved" : "Pending client approval"}</span>
        <h3>{name}</h3>
        <Facts values={[
          ["Client", row.details.client_name],
          ["Office PM", row.opm_name || "Assigned Office PM"],
          ["Project overview", row.details.overview || "Not provided"],
          ...(row.details.client_decision_date ? [["Decision confirmed", formatDay(String(row.details.client_decision_date))] as [string, string]] : []),
        ]} />
        {row.details.client_decision_note && <p>{row.details.client_decision_note}</p>}
        {workflow?.revisions?.map(({ date: day, note }, index) =>
          <Notice key={index}><strong>Revision requested · {formatDay(day)}</strong><p>{note}</p></Notice>)}
        {page === "proposal" && !accepted && <form onSubmit={event => {
          event.preventDefault()
          decide(proposalAction ?? "approve", { decision_date: decisionDate, decision_note: note, reason })
        }}>
          <fieldset className="office-workflow-form" disabled={busy}>
            <label>Discussion date<input required type="date" max={today()} value={decisionDate} onChange={event => setDecisionDate(event.target.value)} /></label>
            <label>{proposalAction === "revise" ? "Requested revisions" : "Internal note (optional)"}
              <textarea required={proposalAction === "revise"} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} />
            </label>
            {proposalAction === "withdraw" && <label>Reason the client declined
              <textarea required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>}
            <div className="office-workflow-actions">
              {proposalAction ? <button type="button" className="button" onClick={() => setProposalAction(undefined)}>Cancel</button> : <>
                <button type="button" className="button inquiry-decline" onClick={() => setProposalAction("withdraw")}>Record client decline</button>
                <button type="button" className="button" onClick={() => setProposalAction("revise")}>Record revision request</button>
              </>}
              <button className="button primary" type="submit">
                {proposalAction === "revise" ? "Save revision request" : proposalAction === "withdraw" ? "Save client decline" : "Mark proposal approved"}
              </button>
            </div>
          </fieldset>
        </form>}
        {page === "proposal" && accepted && <div className="office-workflow-actions">
          <button className="button primary" type="button" onClick={() => navigate("review")}>Review project information</button>
        </div>}
      </Card>

      <Card title="Total allocated project budget (PHP)" icon="doc">
        <p>Record the single amount authorized by the client.</p>
        {(page !== "review" || !review || editing) && <Notice tone="warning">
          {accepted ? "Confirm the project information and dates to unlock the budget." : "Budget entry unlocks after client approval and project information review."}
        </Notice>}
        <form onSubmit={event => {
          event.preventDefault()
          save("budget", { amount: budget })
        }}>
          <fieldset className="office-workflow-form" disabled={busy || page !== "review" || !review || editing}>
            <label>Authorized amount (₱)<input type="number" ref={budgetField} required min="0.01" max="999999999999.99" step="0.01"
              value={budget} onChange={event => setBudget(event.target.value)} /></label>
            <div className="office-workflow-actions">
              {!!workflow?.budget && <button type="button" className="button" disabled={Number(budget) !== workflow.budget}
                onClick={() => navigate("assessment")}>Continue to assessment</button>}
              <button type="submit" className="button primary" disabled={Number(budget) === workflow?.budget}>
                {workflow?.budget ? "Update authorized amount" : "Save allocated budget"}
              </button>
            </div>
          </fieldset>
        </form>
        {!!workflow?.budget_history?.length && <details className="office-workflow-history"><summary>Budget change history</summary>
          <ul>{workflow.budget_history.map(({ at, amount }, index) => <li key={index}>{formatDay(at)} · {currency.format(amount)}</li>)}</ul>
        </details>}
      </Card>
    </div>}

    {page === "review" && <>
      <Notice tone="success"><strong>Proposal approved</strong>
        <p>{review ? `Project information reviewed · Version ${review.version}` : "The assigned Office PM can now confirm or correct the project information."}</p>
      </Notice>
      {!editing && recordCards}
      <form className="office-workflow-form" onSubmit={event => {
        event.preventDefault()
        save("review", { start, end, ...(editing ? { correction: draft, reason } : {}) })
      }}>
        <fieldset className="office-workflow-form" disabled={busy}>
          {editing && <>
            <Card title="Edit client information" icon="users"><div className="office-workflow-fields">{clientFields.map(([key, label]) => editField(key, label))}</div></Card>
            <Card title="Edit project information" icon="building"><div className="office-workflow-fields">{projectFields.map(([key, label]) => editField(key, label))}</div></Card>
          </>}
          {(editing || !review) && <Card title="Estimated project dates" icon="calendar">
            <div className="office-workflow-fields">
              <div>
                <label htmlFor="inquiry-start-date">Estimated start date</label>
                <DatePicker id="inquiry-start-date" calendarTitle="Estimated start date"
                  required disabled={busy} value={start} onValueChange={setStart} />
              </div>
              <div>
                <label htmlFor="inquiry-completion-date">Estimated completion date</label>
                <DatePicker id="inquiry-completion-date" calendarTitle="Estimated completion date"
                  calendarSubtitle="Choose the estimated start date or a later date."
                  required disabled={busy} value={end} min={start || undefined} start={start} onValueChange={setEnd} />
              </div>
            </div>
          </Card>}
          {editing && <Card title="Modification reason" icon="doc">
            <label>Reason for modifications<textarea required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>
            <p>Saving corrections requires a fresh assessment before staffing.</p>
          </Card>}
          <div className="office-workflow-actions office-workflow-action-bar">
            {editing && <button type="button" className="button" onClick={() => {
              setEditing(false)
              setStart(review?.start ?? String(row.details.anticipated_start ?? ""))
              setEnd(review?.end ?? "")
              setReason("")
            }}>Cancel</button>}
            {editing || !review ? <button type="submit" className="button primary">
              {editing ? "Save corrected information" : "Information is accurate"}
            </button> : <button type="button" className="button primary" onClick={() => budgetField.current?.focus()}>Continue to budget section</button>}
          </div>
        </fieldset>
      </form>
      {!!workflow?.review_history?.length && <details className="office-workflow-history"><summary>Project information audit history</summary>
        <ol>{workflow.review_history.map(event => <li key={event.version}>
          <strong>Version {event.version} · {formatDay(event.at)}</strong> {event.reason || "Information confirmed"}
          {!!Object.keys(event.changes).length && <ul>{Object.entries(event.changes).map(([key, change]) =>
            <li key={key}>{key.replace(/_/g, " ")} changed from {amount(change.before ?? undefined)} to {amount(change.after ?? undefined)}</li>)}</ul>}
        </li>)}</ol>
      </details>}
    </>}

    {page === "assessment" && preview && review && <div className="office-workflow-grid assessment">
      <Card title="Project size classification" icon="building">
        <Facts values={[["Lot area (m²)", row.details.lot_area], ["Floor area (m²)", row.details.floor_area_sqm], ["Floors", row.details.floor_count]]} />
        <div className="office-workflow-result"><span>Automatic result</span><strong>{preview.size}</strong>
          <p>{review.estimate.size ? "Based on configured project-type thresholds." : "Based on the workspace’s floor area and floor count thresholds."}</p></div>
      </Card>
      <Card title="Complexity classification" icon="doc">
        <fieldset className="office-workflow-form" disabled={busy || !!assessment}>
          <label>Technical requirements<select value={technical} onChange={event => setTechnical(event.target.value)}>{technicalOptions.map(option => <option key={option}>{option}</option>)}</select></label>
          <label>Project phase arrangement<select value={arrangement} onChange={event => setArrangement(event.target.value)}>{arrangementOptions.map(option => <option key={option}>{option}</option>)}</select></label>
        </fieldset>
        <div className="office-workflow-result"><span>Complexity score · {preview.score}/15</span><strong>{preview.complexity}</strong>
          <p>Planning score based on project type, size, floors, technical systems, and phase overlap.</p></div>
      </Card>
      <Card title="Estimated project duration" icon="calendar">
        <div className="office-workflow-result duration">
          <strong>{preview.durationDays.toLocaleString("en-PH")} {preview.durationDays === 1 ? "day" : "days"}</strong>
          {preview.durationDays >= 30 && <span>About {Math.round(preview.durationDays / 30.4375)} months</span>}
          <p>{formatDay(review.start)} – {formatDay(review.end)}</p>
          {preview.suggestedEnd && <p>Configured planning estimate ends {formatDay(preview.suggestedEnd)}.</p>}
        </div>
        {assessment && <Notice tone="success"><strong>Assessment completed</strong><p>Choose construction phases to continue to Site PM staffing.</p></Notice>}
        <div className="office-workflow-actions">
          {assessment
            ? <button type="button" className="button primary" disabled={busy} onClick={startStaffing}>Continue to construction phases</button>
            : <button type="button" className="button primary" disabled={busy}
                onClick={() => save("assessment", { technical, arrangement })}>Complete assessment</button>}
        </div>
      </Card>
    </div>}
  </div>
}

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { Icon, Modal } from "./ui"
import { addDays } from "./model"
import DatePicker from "./DatePicker"
import MobileNumberInput from "./MobileNumberInput"
import { PH_MOBILE_ERROR } from "../Thesis-Backend/src/domain/mobile-number.js"
import { arrangementOptions, assessInquiry, earliestInquiryCompletion, inquirySize, normalizeFloorMeasurements, technicalOptions, MAX_INQUIRY_FLOORS, MIN_INQUIRY_DURATION_DAYS, type FloorMeasurements } from "../Thesis-Backend/src/domain/inquiry-assessment.js"

export type OfficePage = "pending" | "received" | "accepted" | "proposal" | "review" | "assessment"
type Details = Record<string, string | number>
type ReviewEvent = { at: string; version: number; reason: string; changes: Record<string, { before: string | number | null; after: string | number | null }> }
export type OfficeWorkflow = {
  review?: { version: number; start: string; end: string; technical?: string; arrangement?: string; floorMeasurements?: FloorMeasurements; estimate: { size: string | null; end: string | null } }
  review_history?: ReviewEvent[]
  budget?: number
  budget_history?: { at: string; amount: number }[]
  revisions?: { date: string; note: string }[]
  assessment?: ReturnType<typeof assessInquiry> & { id: string; completed_at: string }
}
export type OfficeRecord = {
  details: Details; workflow?: OfficeWorkflow; status: string; opm_name?: string;
}
type Props = {
  row: OfficeRecord; page: OfficePage; reference: string; consultation: string; busy: boolean; error: string; pendingCount: number; justApproved?: boolean;
  navigate: (page: OfficePage) => void; back: () => void; startStaffing: () => void;
  decide: (action: string, input?: Record<string, string>) => void;
  save: (action: string, input: Record<string, unknown>) => void;
}

const clientFields = [["client_name", "Client name"], ["phone", "Contact number"], ["email", "Email address"]] as const
const projectIdentityFields = [
  ["name", "Project name"], ["project_type", "Project type"], ["address", "Project address / location"],
] as const
const projectMeasurementFields = [
  ["lot_area", "Lot area (m²)"], ["floor_count", "Number of floors"],
] as const
const projectFields = [...projectIdentityFields, ...projectMeasurementFields, ["floor_area_sqm", "Total floor area (m²)"]] as const
const projectTypes = ["Residential", "Commercial", "Mixed-Use"]
const floorPageSize = 12
function floorAreaDraft(details: Details, saved?: FloorMeasurements) {
  const averageArea = Number(details.floor_area_sqm) / Number(details.floor_count)
  return {
    mode: saved?.mode ?? "same",
    perFloor: saved?.mode === "same" ? String(saved.areaPerFloor) : null,
    submittedAverage: Number.isFinite(averageArea) && averageArea > 0 ? averageArea : null,
    areas: saved?.mode === "individual" ? saved.areas.map(String) : [],
  }
}

function suggestedAreaPerFloor(lot: Details[string], submittedLot: Details[string], submittedAverage: number | null) {
  const lotArea = Number(lot)
  const originalLotArea = Number(submittedLot)
  if (!Number.isFinite(lotArea) || lotArea <= 0 || submittedAverage === null) return ""
  if (lotArea === originalLotArea || !Number.isFinite(originalLotArea) || originalLotArea <= 0) return String(submittedAverage)

  const scaledArea = lotArea * Math.min(submittedAverage / originalLotArea, 1)
  return String(Math.min(lotArea, Number(scaledArea.toFixed(2)) || scaledArea))
}
const additionalFields = [["land_area", "Land area (m²)"], ...clientFields] as const
const correctionFields = [...projectFields, ...additionalFields]
const fieldId = (key: string) => `inquiry-review-${key}`
const numericField = (key: string) => /^(land_area|lot_area|floor_area_sqm|floor_count)$/.test(key)
const fieldValue = (key: string, value: Details[string] | null | undefined) => {
  const text = String(value ?? "").trim()
  return numericField(key) && text ? Number(text) : text
}
const hasSizeInputs = (details: Record<string, Details[string] | null | undefined>) => projectTypes.includes(String(details.project_type)) &&
  ["lot_area", "floor_area_sqm"].every(key => Number.isFinite(Number(details[key])) && Number(details[key]) > 0)
const currency = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" })
const date = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" })
const today = () => new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeZone: "Asia/Manila" }).format(new Date())
const latestInquiryStart = addDays("9999-12-31", -MIN_INQUIRY_DURATION_DAYS)
const formatDay = (value: string) => date.format(new Date(value))
const amount = (value: string | number | undefined) => value ?? "Not provided"
const durationLabel = (days: number) => {
  const months = Math.ceil(days / 30)
  const years = Math.floor(months / 12)
  const remainder = months % 12
  return [years && `${years} ${years === 1 ? "year" : "years"}`,
    remainder && `${remainder} ${remainder === 1 ? "month" : "months"}`].filter(Boolean).join(" and ")
}

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

export default function OfficeInquiryWorkflow({ row, page, reference, consultation, busy, error, pendingCount, justApproved, navigate, back, startStaffing, decide, save }: Props) {
  const workflow = row.workflow
  const review = workflow?.review
  const assessment = workflow?.assessment
  const heading = useRef<HTMLHeadingElement>(null)
  const [showApproval, setShowApproval] = useState(justApproved)
  const [showOriginal, setShowOriginal] = useState(false)
  const [fieldError, setFieldError] = useState<{ id: string; message: string }>()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(row.details)
  const [floorArea, setFloorArea] = useState(() => floorAreaDraft(row.details, review?.floorMeasurements))
  const [floorPage, setFloorPage] = useState(0)
  const [start, setStart] = useState(review?.start ?? String(row.details.anticipated_start ?? ""))
  const [end, setEnd] = useState(review?.end ?? "")
  const earliestStart = today()
  const validStart = /^\d{4}-\d{2}-\d{2}$/.test(start) && start >= earliestStart && start <= latestInquiryStart
  const [reason, setReason] = useState("")
  const [budget, setBudget] = useState(String(workflow?.budget ?? ""))
  const [technical, setTechnical] = useState(assessment?.technical ?? review?.technical ?? technicalOptions[0])
  const [arrangement, setArrangement] = useState(assessment?.arrangement ?? review?.arrangement ?? arrangementOptions[0])
  const [decisionDate, setDecisionDate] = useState(today)
  const [note, setNote] = useState("")
  const [proposalAction, setProposalAction] = useState<"revise" | "withdraw">()
  useEffect(() => { heading.current?.focus() }, [])
  useEffect(() => {
    if (fieldError && /^inquiry-review-floor-level-/.test(fieldError.id)) document.getElementById(fieldError.id)?.focus()
  }, [fieldError, floorPage])
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
    proposal: "Client proposal", review: "Edit project information", assessment: "Assess project size, complexity, and duration",
  }[page]
  const descriptions = {
    pending: "Review the consultation request and choose whether to accept the inquiry.",
    received: `${name} is now in your accepted inquiries.`,
    accepted: "Review the client and project information submitted with this inquiry.",
    proposal: "Record the outcome of the proposal discussed with the client.",
    review: "Review the project details, confirm the dates, and enter the authorized budget.",
    assessment: "Use the reviewed project record to assess size, complexity, and duration before staffing.",
  }
  const clientFacts: [string, string | number][] = clientFields.map(([key, label]) => [label, amount(row.details[key])])
  if (row.details.primary_contact) clientFacts.push(["Primary contact", row.details.primary_contact])
  const projectFacts: [string, string | number][] = [
    ...projectFields.filter(([key]) => key !== "name").map(([key, label]): [string, string | number] => [label, amount(row.details[key])]),
    ["Land area (m²)", amount(row.details.land_area)],
    ["Estimated start", review ? formatDay(review.start) : row.details.anticipated_start ? formatDay(String(row.details.anticipated_start)) : "Not provided"],
    ["Estimated completion", review ? formatDay(review.end) : "Not provided"],
    ["Classification", row.details.classification || "Normal"],
  ]
  const preview = review && (assessment ?? assessInquiry(row.details, review.start, review.end, technical, arrangement))
  const minimumReviewedEnd = review && preview ? earliestInquiryCompletion(review.start, preview) : null
  const assessmentNeedsDates = !assessment && !!review && (!minimumReviewedEnd || review.end < minimumReviewedEnd)
  const reviewing = editing || !review
  const compactReview = page === "review" && reviewing
  const floorCount = Number(draft.floor_count)
  const validFloorCount = Number.isInteger(floorCount) && floorCount > 0 && floorCount <= MAX_INQUIRY_FLOORS
  const perFloor = floorArea.perFloor ?? suggestedAreaPerFloor(draft.lot_area, row.details.lot_area, floorArea.submittedAverage)
  const floorInputs = compactReview && validFloorCount && floorArea.mode === "individual"
    ? Array.from({ length: floorCount }, (_, index) => floorArea.areas[index] ?? "") : []
  const calculatedArea = compactReview ? normalizeFloorMeasurements(floorArea.mode === "same"
    ? { mode: "same", areaPerFloor: perFloor }
    : { mode: "individual", areas: floorInputs }, floorCount) : null
  const measuredDraft = { ...draft, floor_area_sqm: calculatedArea?.total ?? "" }
  const scheduleEstimate = compactReview && calculatedArea && hasSizeInputs(measuredDraft)
    ? assessInquiry(measuredDraft, validStart ? start : "", end, technical, arrangement)
    : undefined
  const earliestCompletion = validStart && scheduleEstimate ? earliestInquiryCompletion(start, scheduleEstimate) ?? undefined : undefined
  const selectedCompletion = end || earliestCompletion || ""
  const budgetSaved = !!workflow?.budget && Number(budget) === workflow.budget
  const original = Object.fromEntries(correctionFields.map(([key]) => {
    const firstChange = workflow?.review_history?.find(event => event.changes[key])
    return [key, firstChange ? firstChange.changes[key].before : row.details[key]]
  }))
  const changedFromAdmin = (key: string) => fieldValue(key, measuredDraft[key]) !== fieldValue(key, original[key])
  const hasCorrections = correctionFields.some(([key]) => fieldValue(key, measuredDraft[key]) !== fieldValue(key, row.details[key]))
  const needsReason = hasCorrections || (editing && !!review)
  const size = compactReview && hasSizeInputs(measuredDraft) ? inquirySize(measuredDraft) : undefined
  const originalSize = size && hasSizeInputs(original) ? inquirySize(original) : undefined
  function startEditing() {
    setDraft(row.details)
    setFloorArea(floorAreaDraft(row.details, review?.floorMeasurements))
    setFloorPage(0)
    if (review && (!minimumReviewedEnd || review.end < minimumReviewedEnd)) setEnd("")
    setFieldError(undefined)
    setEditing(true)
  }
  function updateDraft(key: string, value: string) {
    setDraft(previous => ({ ...previous, [key]: value }))
    if (key === "floor_count") setFloorPage(0)
    if (["project_type", "lot_area", "floor_count"].includes(key)) setEnd("")
  }
  function updateFloorArea(value: typeof floorArea) {
    setFloorArea(value)
    setEnd("")
    setFieldError(undefined)
  }
  const describedField = (id: string, description?: string) => ({
    id,
    "aria-invalid": fieldError?.id === id || undefined,
    "aria-describedby": [description, fieldError?.id === id ? `${id}-error` : undefined].filter(Boolean).join(" ") || undefined,
  })
  const inlineError = (id: string) => fieldError?.id === id &&
    <p className="office-review-field-error" id={`${id}-error`} role="alert">{fieldError.message}</p>
  const editField = (key: string, label: string) => {
    const numeric = numericField(key)
    const changed = changedFromAdmin(key)
    const id = fieldId(key)
    const helper = changed ? `${id}-helper` : undefined
    return <div key={key} className={changed ? "office-review-field-changed" : undefined}>
      <label htmlFor={id}>{label}</label>{key === "project_type"
      ? <select {...describedField(id, helper)} required value={draft[key] ?? ""} onChange={event => updateDraft(key, event.target.value)}>
        <option value="">Select a project type</option>
        {projectTypes.map(type => <option key={type}>{type}</option>)}
      </select>
      : key === "phone" ? <MobileNumberInput {...describedField(id, helper)} required value={String(draft[key] ?? "")}
          onValueChange={value => updateDraft(key, value)} />
      : <input {...describedField(id, helper)} type={numeric ? "number" : key === "email" ? "email" : "text"}
          min={numeric ? key === "floor_count" ? 1 : 0 : undefined} step={numeric ? key === "floor_count" ? 1 : "any" : undefined}
          max={key === "floor_count" ? MAX_INQUIRY_FLOORS : undefined} maxLength={numeric ? undefined : key === "address" ? 500 : 150}
          required={key !== "land_area"} value={draft[key] ?? ""} onChange={event => updateDraft(key, event.target.value)} />}
      {helper && <div className="office-review-field-helper" id={helper}>
        {changed && <span>Admin: {amount(original[key] ?? undefined)}{original[key] != null && ["land_area", "lot_area", "floor_area_sqm"].includes(key) ? " m²" : ""}</span>}
      </div>}
      {inlineError(id)}
    </div>
  }
  function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (!reviewing) {
      if (!budgetSaved) save("budget", { amount: budget })
      return
    }
    if (validFloorCount && !calculatedArea) {
      const invalidFloor = floorInputs.findIndex(value => !Number.isFinite(Number(value)) || Number(value) <= 0)
      const id = floorArea.mode === "same" ? fieldId("area-per-floor") : fieldId(`floor-level-${Math.max(0, invalidFloor) + 1}`)
      if (floorArea.mode === "individual") setFloorPage(Math.floor(Math.max(0, invalidFloor) / floorPageSize))
      setFieldError({ id, message: "Enter a positive area for every floor and check that the total is valid." })
      document.getElementById(id)?.focus()
      return
    }
    const controls = event.currentTarget.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea")
    for (const control of controls) {
      let message = ""
      if (control.id === "inquiry-completion-date" && (!earliestCompletion || selectedCompletion < earliestCompletion)) {
        message = earliestCompletion ? `Choose ${formatDay(earliestCompletion)} or later.`
          : "Choose a start date and project measurements that produce a completion date within the supported range."
      } else if (control.willValidate) {
        const key = control.id.replace("inquiry-review-", "")
        const value = control.value.trim()
        if (control.id === "inquiry-start-date" && !validStart) message = "Choose a valid estimated start date of today or later."
        else if (control.required && !value && !control.validity.badInput) message = "Complete this required field."
        else if (!control.validity.valid) message = key === "phone" ? PH_MOBILE_ERROR : control.validationMessage
        else if (numericField(key) && value && Number(value) <= 0) message = "Enter a value greater than zero."
        else if (key === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) message = "Enter a valid personal or business email address."
      }
      if (message) {
        const target = control.disabled ? event.currentTarget.querySelector<HTMLInputElement>("#inquiry-start-date") : control
        if (!target) return
        setFieldError({ id: target.id, message })
        const detailsPanel = target.closest("details")
        if (detailsPanel) detailsPanel.open = true
        target.focus()
        return
      }
    }
    setFieldError(undefined)
    if (!calculatedArea) return
    save("review", { start, end: selectedCompletion, technical, arrangement, amount: budget,
      floorMeasurements: calculatedArea.measurements,
      ...(hasCorrections ? { correction: measuredDraft } : {}), ...(needsReason ? { reason } : {}) })
  }
  const recordCards = <div className="office-workflow-grid">
    <Card title="Client information" icon="users"><Facts values={clientFacts} /></Card>
    <Card title="Project information" icon="building"><Facts values={projectFacts} />
      {row.details.overview && <p>{row.details.overview}</p>}
    </Card>
  </div>

  return <div className={`office-workflow${compactReview ? " office-review-compact" : ""}`}>
    <div className="office-review-top">
      <button type="button" className="button office-workflow-back" disabled={busy} onClick={back}>← Project inquiries</button>
      {compactReview && showApproval && <div className="office-review-toast">
        <Icon name="check" />
        <div role="status"><strong>Proposal approved</strong><p>{descriptions.review}</p></div>
        <button className="button icon-button" type="button" aria-label="Dismiss approval notice" onClick={() => setShowApproval(false)}><Icon name="close" /></button>
      </div>}
    </div>
    {!compactReview && page !== "pending" && page !== "received" && <nav className="office-workflow-nav" aria-label="Inquiry workflow">
      {([["accepted", "Accepted inquiry", true], ["proposal", "Client proposal", true], ["review", "Project information & budget", accepted],
        ["assessment", "Project assessment", accepted && Boolean(workflow?.budget && review)]] as const).map(([key, label, enabled]) =>
        <button type="button" className="button" key={key} disabled={busy || !enabled}
          aria-current={page === key ? "step" : undefined} onClick={() => navigate(key)}>{label}</button>)}
    </nav>}
    <header className="office-workflow-heading">
      <div>{compactReview
        ? <><p className="inquiry-muted">{name}</p><div className="office-review-title"><h1 ref={heading} tabIndex={-1}>{title}</h1><span>Step 2 of 3</span></div></>
        : <><p className="inquiry-muted">Inquiry reference {reference}</p><h1 ref={heading} tabIndex={-1}>{page === "review" ? "Project information and budget" : title}</h1><p>{descriptions[page]}</p></>}
      </div>
      {page === "accepted" && <button type="button" className="button primary" onClick={() => navigate(accepted ? "review" : "proposal")}>
        {accepted ? "Review project information" : "Open proposal"}
      </button>}
      {compactReview && <button type="button" className="button" onClick={() => setShowOriginal(true)}>View Admin submission</button>}
      {page === "review" && !reviewing && <button type="button" className="button" disabled={busy} onClick={startEditing}>Edit project information</button>}
      {page === "assessment" && preview && <div className="office-workflow-actions">
        {assessment
          ? <button type="button" className="button primary" disabled={busy} onClick={startStaffing}>Continue to construction phases</button>
          : <button type="button" className="button primary" disabled={busy || assessmentNeedsDates}
              onClick={() => save("assessment", { technical, arrangement })}>Complete assessment</button>}
      </div>}
    </header>
    {error && <p className="office-workflow-error" role="alert">{error}</p>}
    {busy && <p role="status">Saving or loading inquiry…</p>}

    {page === "pending" && <div className="office-workflow-grid">
      <Card title="Consultation request" icon="users">
        <Facts values={[
          ["Inquiry urgency", row.details.classification || "Normal"],
          ["Preferred consultation timing", consultation],
        ]} />
        <div className="office-workflow-actions">
          <button type="button" className="button danger-ghost" disabled={busy} onClick={() => decide("cancel")}>Reject inquiry</button>
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

    {page === "proposal" && <>
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
            <div>
              <label htmlFor="inquiry-discussion-date">Discussion date</label>
              <DatePicker id="inquiry-discussion-date" calendarTitle="Discussion date"
                required disabled={busy} max={today()} value={decisionDate} onValueChange={setDecisionDate} />
            </div>
            <label>{proposalAction === "revise" ? "Requested revisions" : "Internal note (optional)"}
              <textarea required={proposalAction === "revise"} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} />
            </label>
            {proposalAction === "withdraw" && <label>Reason the client declined
              <textarea required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>}
            <div className="office-workflow-actions">
              {proposalAction ? <button type="button" className="button" onClick={() => setProposalAction(undefined)}>Cancel</button> : <>
                <button type="button" className="button danger" onClick={() => setProposalAction("withdraw")}>Client Dropped Project</button>
                <button type="button" className="button" onClick={() => setProposalAction("revise")}>Revision Request</button>
              </>}
              <button className={`button ${proposalAction === "withdraw" ? "danger" : "primary"}`} type="submit">
                {proposalAction === "revise" ? "Save revision request" : proposalAction === "withdraw" ? "Confirm client dropped project" : "Mark proposal approved"}
              </button>
            </div>
          </fieldset>
        </form>}
        {page === "proposal" && accepted && <div className="office-workflow-actions">
          <button className="button primary" type="button" onClick={() => navigate("review")}>Review project information</button>
        </div>}
      </Card>

    </>}

    {page === "review" && <>
      {showOriginal && <Modal title="Admin submission" subtitle="Original inquiry · Read only" onClose={() => setShowOriginal(false)}>
        <div className="office-admin-submission">
          <Facts values={[
            ...correctionFields.map(([key, label]): [string, string | number] => [label, amount(original[key] ?? undefined)]),
            ["Estimated start", row.details.anticipated_start ? formatDay(String(row.details.anticipated_start)) : "Not provided"],
            ["Classification", row.details.classification || "Normal"],
          ]} />
          {row.details.overview && <p>{row.details.overview}</p>}
        </div>
      </Modal>}
      {!reviewing && <Card title="Client information" icon="users"><Facts values={clientFacts} /></Card>}
      <form className="office-workflow-form" noValidate={reviewing} onSubmit={submitReview} onChange={event => {
        if ((event.target as HTMLElement).id === fieldError?.id) setFieldError(undefined)
      }}>
        {reviewing ? <fieldset className="inquiry-card office-review-form" disabled={busy}>
          <div className="office-workflow-fields">
            {projectIdentityFields.map(([key, label]) => editField(key, label))}
          </div>
          <section className="office-workflow-subsection" aria-labelledby={fieldId("measurements")}>
            <h3 id={fieldId("measurements")}>Project measurements</h3>
            <div className="office-workflow-fields">
              {projectMeasurementFields.map(([key, label]) => editField(key, label))}
              <label>Floor sizes<select value={floorArea.mode} onChange={event => {
                const mode = event.target.value === "individual" ? "individual" : "same"
                updateFloorArea({ ...floorArea, mode, areas: mode === "individual" && !floorArea.areas.length && validFloorCount
                  ? Array.from({ length: floorCount }, () => perFloor) : floorArea.areas })
                setFloorPage(0)
              }}><option value="same">All floors have the same area</option><option value="individual">Enter each floor separately</option></select></label>
            </div>
            <div className="office-workflow-fields">
              {floorArea.mode === "same" ? <div>
                <label htmlFor={fieldId("area-per-floor")}>Area per floor (m²)</label>
                <input {...describedField(fieldId("area-per-floor"), floorArea.perFloor === null ? fieldId("area-per-floor-hint") : undefined)} required type="number" min="0" step="any" value={perFloor}
                  onChange={event => updateFloorArea({ ...floorArea, perFloor: event.target.value })} />
                {floorArea.perFloor === null && <div className="office-review-field-helper" id={fieldId("area-per-floor-hint")}>
                  Suggested from the submitted measurements and adjusted when lot area changes. Enter the actual area if known.
                </div>}
                {inlineError(fieldId("area-per-floor"))}
              </div> : floorInputs.slice(floorPage * floorPageSize, (floorPage + 1) * floorPageSize).map((value, offset) => {
                const index = floorPage * floorPageSize + offset
                const id = fieldId(`floor-level-${index + 1}`)
                return <div key={id}>
                  <label htmlFor={id}>Floor {index + 1} area (m²)</label>
                  <input {...describedField(id)} required type="number" min="0" step="any" value={value} onChange={event => {
                    const areas = [...floorArea.areas]
                    areas[index] = event.target.value
                    updateFloorArea({ ...floorArea, areas })
                  }} />
                  {inlineError(id)}
                </div>
              })}
            </div>
            {floorInputs.length > floorPageSize && <div className="office-workflow-actions office-floor-pagination">
              <button className="button" type="button" disabled={floorPage === 0} onClick={() => setFloorPage(floorPage - 1)}>Previous floors</button>
              <span>Floors {floorPage * floorPageSize + 1}–{Math.min((floorPage + 1) * floorPageSize, floorCount)} of {floorCount}</span>
              <button className="button" type="button" disabled={(floorPage + 1) * floorPageSize >= floorCount} onClick={() => setFloorPage(floorPage + 1)}>Next floors</button>
            </div>}
            <div className="office-workflow-fields office-floor-estimate" aria-live="polite">
              <div><span>Total floor area</span><strong>{calculatedArea ? `${calculatedArea.total.toLocaleString("en-PH", { maximumSignificantDigits: 15 })} m²` : "Enter the floor areas"}</strong>
                {changedFromAdmin("floor_area_sqm") && <span className="office-review-field-helper" id={`${fieldId("floor_area_sqm")}-helper`}>Admin: {amount(original.floor_area_sqm ?? undefined)} m²</span>}
              </div>
              <div><span>Estimated duration</span><strong>{scheduleEstimate?.planningDays != null && Number.isFinite(scheduleEstimate.planningDays)
                ? `${scheduleEstimate.planningDays.toLocaleString("en-PH")} calendar days` : "Pending measurements"}</strong>
                {scheduleEstimate && <span>{scheduleEstimate.complexity} complexity</span>}
              </div>
              <div><span>Project size</span>
                <div className="office-review-size">{size ? <>{originalSize && originalSize !== size && `${originalSize} → `}<strong>{size}</strong></> : "Pending measurements"}</div>
              </div>
            </div>
          </section>
          <details className="office-review-additional">
            <summary>Client information and land area</summary>
            <div className="office-workflow-fields">{additionalFields.map(([key, label]) => editField(key, label))}</div>
          </details>
          {needsReason && <div>
            <label htmlFor={fieldId("reason")}>Reason for changes</label>
            <input {...describedField(fieldId("reason"))} required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} />
            {inlineError(fieldId("reason"))}
          </div>}
          <div className="office-workflow-fields">
              <div>
                <label htmlFor="inquiry-start-date">Estimated start date</label>
                <DatePicker {...describedField("inquiry-start-date")} calendarTitle="Estimated start date"
                  calendarSubtitle="Choose today or a later date."
                  required disabled={busy} min={earliestStart} max={latestInquiryStart} value={start} onValueChange={value => {
                    setStart(value)
                    setEnd("")
                    setFieldError(undefined)
                  }} />
                {inlineError("inquiry-start-date")}
              </div>
              <div>
                <label htmlFor="inquiry-completion-date">Estimated completion date</label>
                <DatePicker {...describedField("inquiry-completion-date", "inquiry-completion-hint")} calendarTitle="Estimated completion date"
                  calendarSubtitle={earliestCompletion && `Select ${formatDay(earliestCompletion)} or later.`}
                  required disabled={busy || !earliestCompletion} value={selectedCompletion} min={earliestCompletion} highlightMin
                  onValueChange={value => { setEnd(value); setFieldError(undefined) }} />
                {inlineError("inquiry-completion-date")}
                <p className="office-review-field-helper" id="inquiry-completion-hint">{earliestCompletion ? `Earliest completion: ${formatDay(earliestCompletion)}`
                  : validStart ? "Review the inputs for a completion estimate." : "Select a valid start date first."}</p>
              </div>
              <div>
                <label htmlFor={fieldId("budget")}>Authorized budget (₱)</label>
                <input {...describedField(fieldId("budget"))} type="number" required min="0.01" max="999999999999.99" step="0.01"
                  placeholder="Enter approved amount" value={budget} onChange={event => setBudget(event.target.value)} />
                {inlineError(fieldId("budget"))}
              </div>
            </div>
            <div className="office-workflow-fields">
              <label>Technical requirements<select value={technical} onChange={event => { setTechnical(event.target.value); setEnd("") }}>
                {technicalOptions.map(option => <option key={option}>{option}</option>)}
              </select></label>
              <label>Project phase arrangement<select value={arrangement} onChange={event => { setArrangement(event.target.value); setEnd("") }}>
                {arrangementOptions.map(option => <option key={option}>{option}</option>)}
              </select></label>
            </div>
          <div className="office-workflow-actions">
            {editing && <button type="button" className="button" onClick={() => {
              setEditing(false)
              setStart(review?.start ?? String(row.details.anticipated_start ?? ""))
              setEnd(review?.end ?? "")
              setTechnical(assessment?.technical ?? review?.technical ?? technicalOptions[0])
              setArrangement(assessment?.arrangement ?? review?.arrangement ?? arrangementOptions[0])
              setBudget(String(workflow?.budget ?? ""))
              setReason("")
              setFieldError(undefined)
            }}>Cancel</button>}
            <button type="submit" className="button primary">Save and continue</button>
          </div>
        </fieldset> : <fieldset className="office-workflow-form" disabled={busy}>
          <Card title="Project information" icon="building">
          <Facts values={projectFacts} />{row.details.overview && <p>{row.details.overview}</p>}
          <section className="office-workflow-subsection">
            <h3>Budget allocation</h3>
            <label>Authorized amount (₱)<input type="number" required min="0.01" max="999999999999.99" step="0.01"
              value={budget} onChange={event => setBudget(event.target.value)} /></label>
            {!!workflow?.budget_history?.length && <details className="office-workflow-history"><summary>Budget change history</summary>
              <ul>{workflow.budget_history.map(({ at, amount }, index) => <li key={index}>{formatDay(at)} · {currency.format(amount)}</li>)}</ul>
            </details>}
          </section>
          </Card>
          <div className="office-workflow-actions office-workflow-action-bar">
            {budgetSaved
              ? <button type="button" className="button primary" onClick={() => navigate("assessment")}>Continue to assessment</button>
              : <button type="submit" className="button primary">Save allocated budget</button>}
          </div>
        </fieldset>}
      </form>
      {!!workflow?.review_history?.length && <details className="office-workflow-history"><summary>Project information audit history</summary>
        <ol>{workflow.review_history.map(event => <li key={event.version}>
          <strong>Version {event.version} · {formatDay(event.at)}</strong> {event.reason || "Information confirmed"}
          {!!Object.keys(event.changes).length && <ul>{Object.entries(event.changes).map(([key, change]) =>
            <li key={key}>{key.replace(/_/g, " ")} changed from {amount(change.before ?? undefined)} to {amount(change.after ?? undefined)}</li>)}</ul>}
        </li>)}</ol>
      </details>}
    </>}

    {page === "assessment" && preview && review && <>
    {assessmentNeedsDates && <Notice tone="warning">
      <p>{minimumReviewedEnd
        ? `This assessment requires a completion date of ${formatDay(minimumReviewedEnd)} or later.`
        : "The estimated completion is outside the supported date range."} Review the requirements and estimated dates in Project information.</p>
      <button type="button" className="button" onClick={() => navigate("review")}>Review project information</button>
    </Notice>}
    <div className="office-workflow-grid assessment">
      <Card title="Project size classification" icon="building">
        <Facts values={[["Lot area (m²)", row.details.lot_area], ["Floor area (m²)", row.details.floor_area_sqm], ["Floors", row.details.floor_count]]} />
        <div className="office-workflow-result"><strong>{preview.size}</strong>
          <p>{preview.planningDays != null ? "Uses the higher size category from lot area and total floor area." : "Size recorded when this assessment was completed."}</p></div>
      </Card>
      <Card title="Complexity classification" icon="doc">
        <fieldset className="office-workflow-form" disabled={busy || !!assessment}>
          <label>Technical requirements<select value={technical} onChange={event => setTechnical(event.target.value)}>{technicalOptions.map(option => <option key={option}>{option}</option>)}</select></label>
          <label>Project phase arrangement<select value={arrangement} onChange={event => setArrangement(event.target.value)}>{arrangementOptions.map(option => <option key={option}>{option}</option>)}</select></label>
        </fieldset>
        <div className="office-workflow-result"><span>Complexity score · {preview.score}/15</span><strong>{preview.complexity}</strong>
          <p>Planning score based on project type, size, floors, technical systems, and phase overlap.</p>
          {preview.durationMultiplier != null && <p>Duration multiplier ×{preview.durationMultiplier.toFixed(2)}</p>}</div>
      </Card>
      <Card title="Estimated project duration" icon="calendar">
        <div className="office-workflow-result duration">
          {preview.planningDays != null && <><strong>{durationLabel(preview.planningDays)}</strong>
            <span>{preview.planningDays.toLocaleString("en-PH")} estimated calendar days</span></>}
          {preview.suggestedEnd && <p>Suggested completion: {formatDay(preview.suggestedEnd)}</p>}
          <p>Reviewed schedule: {formatDay(review.start)} – {formatDay(review.end)} ({preview.durationDays.toLocaleString("en-PH")} calendar days)</p>
        </div>
        {assessment && <Notice tone="success"><strong>Assessment completed</strong><p>Choose construction phases to continue to Site PM staffing.</p></Notice>}
      </Card>
    </div></>}
  </div>
}

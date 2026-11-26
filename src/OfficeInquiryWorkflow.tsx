import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { Icon } from "./ui"
import { addDays, initials } from "./model"
import DatePicker from "./DatePicker"
import MobileNumberInput from "./MobileNumberInput"
import GroupedNumberInput from "./GroupedNumberInput"
import { PH_MOBILE_ERROR } from "../Thesis-Backend/src/domain/mobile-number.js"
import { MIXED_USE_FEATURES, MIXED_USE_USES, mixedUseSelectionsError, type MixedUseSelections } from "../Thesis-Backend/src/domain/mixed-use-scope.js"
import { arrangementOptions, assessInquiry, earliestInquiryCompletion, inquiryAssessmentBasis, inquiryAssessmentReady, inquiryCostEstimate, inquirySize, floorAreaRange, averageFloorAreaError, MAX_INQUIRY_AREA, normalizeFloorMeasurements, technicalOptions, MAX_INQUIRY_FLOORS, MIN_INQUIRY_DURATION_DAYS, MIN_AVERAGE_FLOOR_AREA, type FloorMeasurements } from "../Thesis-Backend/src/domain/inquiry-assessment.js"

export type OfficePage = "pending" | "received" | "accepted" | "proposal" | "review" | "assessment"
type Details = Record<string, string | number>
type ReviewEvent = { at: string; version: number; reason: string; changes: Record<string, { before: string | number | null; after: string | number | null }> }
export type OfficeWorkflow = {
  review?: { version: number; start: string; end: string; technical?: string; arrangement?: string; requires_review?: boolean; mixed_use_scope?: MixedUseSelections; floorMeasurements?: FloorMeasurements; estimate: { size: string | null; end: string | null } }
  review_history?: ReviewEvent[]
  budget?: number
  budget_history?: { at: string; amount: number }[]
  revisions?: { date: string; note: string }[]
  assessment?: ReturnType<typeof assessInquiry> & { id: string; completed_at: string }
  signed_contract?: { id: string; name: string }
  contract_locked?: boolean
  staffing?: { contract_file_id?: string }
}
export type OfficeRecord = {
  details: Details; workflow?: OfficeWorkflow; status: string; opm_name?: string; updated_at?: string;
}
type Props = {
  row: OfficeRecord; page: OfficePage; reference: string; consultation: string; busy: boolean; error: string; pendingCount: number; justApproved?: boolean;
  navigate: (page: OfficePage) => void; back: () => void; startStaffing: () => void;
  signedContract: ReactNode; hasSignedContract: boolean;
  decide: (action: string, input?: Record<string, string>) => void;
  save: (action: string, input: Record<string, unknown>) => void;
}

const clientFields = [["client_name", "Client name"], ["phone", "Contact number"], ["email", "Email address"]] as const
const projectIdentityFields = [
  ["name", "Project name"], ["address", "Project address / location"], ["project_type", "Project type"],
] as const
const projectMeasurementFields = [
  ["lot_area", "Lot area (m²)"], ["floor_count", "Number of floors"],
] as const
const projectFields = [...projectIdentityFields, ...projectMeasurementFields, ["floor_area_sqm", "Total floor area (m²)"]] as const
const projectTypes = ["Residential", "Commercial", "Mixed-Use"]
const projectSizes = ["Small", "Medium", "Large"]
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

const correctionFields = [...projectFields, ...clientFields]
const fieldId = (key: string) => `inquiry-review-${key}`
const numericField = (key: string) => /^(lot_area|floor_area_sqm|floor_count)$/.test(key)
const fieldValue = (key: string, value: Details[string] | null | undefined) => {
  const text = String(value ?? "").trim()
  return numericField(key) && text ? Number(text) : text
}
const hasSizeInputs = (details: Record<string, Details[string] | null | undefined>) => projectTypes.includes(String(details.project_type)) &&
  ["lot_area", "floor_area_sqm"].every(key => Number.isFinite(Number(details[key])) && Number(details[key]) > 0)
const currency = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" })
const wholePeso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 })
const date = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" })
const today = () => new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeZone: "Asia/Manila" }).format(new Date())
const latestInquiryStart = addDays("9999-12-31", -MIN_INQUIRY_DURATION_DAYS)
const formatDay = (value: string) => date.format(new Date(value))
const amount = (value: string | number | undefined) => value ?? "Not provided"
const assessmentNumber = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 4 })
const durationLabel = (days: number) => {
  const months = Math.ceil(days / 30)
  const years = Math.floor(months / 12)
  const remainder = months % 12
  return [years && `${years} ${years === 1 ? "year" : "years"}`,
    remainder && `${remainder} ${remainder === 1 ? "month" : "months"}`].filter(Boolean).join(" and ")
}

function Card({ title, icon, assessmentMetric, actions, children }: {
  title: string; icon?: string; assessmentMetric?: "size" | "complexity" | "duration"; actions?: ReactNode; children: ReactNode
}) {
  return <section className="inquiry-card office-workflow-card" data-assessment-metric={assessmentMetric}>
    <header className="inquiry-section-heading">
      {icon && <span className="inquiry-list-icon"><Icon name={icon} /></span>}
      <h2>{title}</h2>
      {actions}
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

type ReviewItemState = "input" | "review" | "complete"
function ReviewItemStatus({ state }: { state: ReviewItemState }) {
  return <span className="office-item-status" data-state={state} role="status">
    <Icon name={state === "complete" ? "check" : state === "review" ? "clock" : "edit"} size={14} />
    {state === "complete" ? "Complete" : state === "review" ? "Needs review" : "Needs your input"}
  </span>
}

export default function OfficeInquiryWorkflow({ row, page, reference, consultation, busy, error, pendingCount, justApproved, navigate, back, startStaffing, signedContract, hasSignedContract, decide, save }: Props) {
  const workflow = row.workflow
  const review = workflow?.review
  const assessment = workflow?.assessment
  const heading = useRef<HTMLHeadingElement>(null)
  const [showApproval, setShowApproval] = useState(justApproved)
  const [fieldError, setFieldError] = useState<{ id: string; message: string }>()
  const reviewForm = useRef<HTMLFormElement>(null)
  const [reviewIssue, setReviewIssue] = useState<{ id: string; message: string }>()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(row.details)
  const [detailsEditing, setDetailsEditing] = useState(false)
  const [detailsStaged, setDetailsStaged] = useState(false)
  const detailsEditSnapshot = useRef<{ draft: Details; end: string; reviewedItems: Record<string, boolean> }>()
  const [reviewedItems, setReviewedItems] = useState<Record<string, boolean>>({ floors: !!review?.floorMeasurements && !review?.requires_review, technical: !!review?.technical && !review?.requires_review, arrangement: !!review?.arrangement && !review?.requires_review, dates: !!review?.start && !!review?.end && !review?.requires_review })
  const mixedUse = row.details.project_type === "Mixed-Use"
  const [scope, setScope] = useState<MixedUseSelections>(() => review?.mixed_use_scope ?? {
    version: 1, uses: [], features: { podium: false, tower: false, curtainWall: false, landscaping: false },
  })
  const scopeError = mixedUse ? mixedUseSelectionsError(scope) : ""
  const [floorArea, setFloorArea] = useState(() => floorAreaDraft(row.details, review?.floorMeasurements))
  const [floorPage, setFloorPage] = useState(0)
  const [start, setStart] = useState(review?.start ?? String(row.details.anticipated_start ?? ""))
  const [end, setEnd] = useState(review?.end ?? "")
  const earliestStart = addDays(today(), 14)
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
      setDetailsEditing(false)
      setDetailsStaged(false)
      detailsEditSnapshot.current = undefined
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
  const assessmentAvailable = accepted && inquiryAssessmentReady(row.details, workflow)
  const title = {
    pending: "Pending inquiry", received: pendingCount ? "Inquiry accepted" : "No pending inquiries", accepted: name,
    proposal: "Client proposal", review: "Edit project information", assessment: "Project assessment",
  }[page]
  const descriptions = {
    pending: "Review the consultation request and choose whether to accept the inquiry.",
    received: `${name} is now in your accepted inquiries.`,
    accepted: "Review the client and project information submitted with this inquiry.",
    proposal: "Record the outcome of the proposal discussed with the client.",
    review: "Review the project details, confirm the dates, and enter the authorized budget.",
    assessment: "Use the reviewed project record to assess size, complexity, and duration before staffing.",
  }
  const responseDeadline = row.details.response_due_at ? new Date(String(row.details.response_due_at)).toLocaleString("en-PH", { timeZone: "Asia/Manila" }) + " (Philippine time)" : undefined
  const clientFacts: [string, string | number][] = clientFields.map(([key, label]) => [label, amount(row.details[key])])
  if (row.details.primary_contact) clientFacts.push(["Primary contact", row.details.primary_contact])
  if (row.details.client_type === "company") {
    clientFacts.push(["Company name", amount(row.details.company_name)])
    if (row.details.designation) clientFacts.push(["Position / designation", row.details.designation])
  }
  const projectFacts: [string, string | number][] = [
    ...projectFields.filter(([key]) => key !== "name").map(([key, label]): [string, string | number] => [label, amount(row.details[key])]),
    ["Estimated start", review ? formatDay(review.start) : row.details.anticipated_start ? formatDay(String(row.details.anticipated_start)) : "Not provided"],
    ["Estimated completion", review ? formatDay(review.end) : "Not provided"],
    ["Classification", row.details.classification || "Normal"],
  ]
  const preview = review && (assessment ?? assessInquiry(row.details, review.start, review.end, technical, arrangement, review.mixed_use_scope))
  const currentEstimate = page === "assessment" && review && preview &&
    (assessment ? assessInquiry(row.details, review.start, review.end, preview.technical, preview.arrangement, review.mixed_use_scope) : preview)
  const assessmentBasis = currentEstimate && preview && currentEstimate.size === preview.size && currentEstimate.score === preview.score &&
    currentEstimate.complexity === preview.complexity && currentEstimate.planningDays === preview.planningDays &&
    currentEstimate.durationMultiplier === preview.durationMultiplier
    ? inquiryAssessmentBasis(row.details, preview.technical, preview.arrangement, review?.mixed_use_scope) : undefined
  const minimumReviewedEnd = review && preview ? earliestInquiryCompletion(review.start, preview) : null
  const assessmentNeedsDates = !assessment && !!review && (!minimumReviewedEnd || review.end < minimumReviewedEnd)
  const reviewing = editing || !review || review.requires_review || mixedUse && !review.mixed_use_scope
  const compactReview = page === "review" && reviewing
  const showIntakeRecord = page !== "pending" && page !== "received" && !compactReview
  const floorCount = Number(draft.floor_count)
  const validFloorCount = Number.isInteger(floorCount) && floorCount > 0 && floorCount <= MAX_INQUIRY_FLOORS
  const lotArea = Number(draft.lot_area)
  const areaRange = floorAreaRange(lotArea, floorCount)
  const submittedAverage = floorArea.submittedAverage
  const averageOutsideCorrectedLot = submittedAverage !== null && lotArea > 0 &&
    lotArea !== Number(row.details.lot_area) && !!averageFloorAreaError(lotArea, submittedAverage * floorCount, floorCount)
  const perFloor = floorArea.perFloor ?? (averageOutsideCorrectedLot ? "" : String(submittedAverage ?? ""))
  const floorInputs = compactReview && validFloorCount && floorArea.mode === "individual"
    ? Array.from({ length: floorCount }, (_, index) => floorArea.areas[index] ?? "") : []
  const calculatedArea = compactReview ? normalizeFloorMeasurements(floorArea.mode === "same"
    ? { mode: "same", areaPerFloor: perFloor }
    : { mode: "individual", areas: floorInputs }, floorCount, lotArea) : null
  const measuredDraft: Details = { ...draft, floor_area_sqm: calculatedArea?.total ?? "" }
  const scheduleEstimate = compactReview && calculatedArea && hasSizeInputs(measuredDraft)
    ? assessInquiry(measuredDraft, validStart ? start : "", end, technical, arrangement, mixedUse ? scope : undefined)
    : undefined
  const earliestCompletion = validStart && scheduleEstimate ? earliestInquiryCompletion(start, scheduleEstimate) ?? undefined : undefined
  const selectedCompletion = end || earliestCompletion || ""
  const budgetDetails = reviewing ? measuredDraft : row.details
  const budgetComplexity = reviewing ? scheduleEstimate?.complexity : review && hasSizeInputs(budgetDetails)
    ? assessInquiry(budgetDetails, review.start, review.end, review.technical ?? technicalOptions[0],
      review.arrangement ?? arrangementOptions[0], review.mixed_use_scope).complexity : undefined
  const costEstimate = budgetComplexity ? inquiryCostEstimate(budgetDetails, budgetComplexity) : null
  const budgetError = costEstimate && budget && Number(budget) < costEstimate.minimum
    ? `Enter an authorized budget of at least ${wholePeso.format(costEstimate.minimum)}.` : ""
  const budgetSaved = !!workflow?.budget && Number(budget) === workflow.budget && !budgetError
  const original = Object.fromEntries(correctionFields.map(([key]) => {
    const firstChange = workflow?.review_history?.find(event => event.changes[key])
    return [key, (firstChange ? firstChange.changes[key].before : row.details[key]) ?? ""]
  }))
  const changedFromAdmin = (key: string) => fieldValue(key, measuredDraft[key]) !== fieldValue(key, original[key])
  const detailsChanged = !!detailsEditSnapshot.current && (["name", "address", "lot_area", "floor_count"] as const)
    .some(key => fieldValue(key, draft[key]) !== fieldValue(key, detailsEditSnapshot.current?.draft[key]))
  const originalAverageArea = Number(original.floor_area_sqm) / Number(original.floor_count)
  const areaWasEdited = (value: string) => value !== "" && Number(value) !== originalAverageArea
  const editedAreaPerFloor = floorArea.perFloor !== null && areaWasEdited(perFloor)
  const hasCorrections = correctionFields.some(([key]) => fieldValue(key, measuredDraft[key]) !== fieldValue(key, row.details[key]))
  const needsReason = hasCorrections || !!review && (start !== review.start || selectedCompletion !== review.end ||
    technical !== (review.technical ?? technicalOptions[0]) || arrangement !== (review.arrangement ?? arrangementOptions[0]))
  const floorState: ReviewItemState = !calculatedArea ? "input" : reviewedItems.floors ? "complete" : "review"
  const datesValid = validStart && !!earliestCompletion && selectedCompletion >= earliestCompletion
  const dateState: ReviewItemState = !datesValid ? "input" : reviewedItems.dates ? "complete" : "review"
  const budgetValid = !!costEstimate && /^\d+(?:\.\d{0,2})?$/.test(budget) && Number(budget) >= costEstimate.minimum && Number(budget) <= 999999999999.99
  const budgetState: ReviewItemState = budgetValid ? "complete" : "input"
  function markReviewed(key: string) { setReviewedItems(previous => ({ ...previous, [key]: true })) }
  const size = compactReview && hasSizeInputs(measuredDraft) ? inquirySize(measuredDraft) : undefined
  const originalSize = size && hasSizeInputs(original) ? inquirySize(original) : undefined
  function startEditing() {
    setDraft(row.details)
    setDetailsEditing(false)
    setDetailsStaged(false)
    detailsEditSnapshot.current = undefined
    setFloorArea(floorAreaDraft(row.details, review?.floorMeasurements))
    setFloorPage(0)
    if (review && (!minimumReviewedEnd || review.end < minimumReviewedEnd)) setEnd("")
    setFieldError(undefined)
    setEditing(true)
  }
  function cancelDetailsEditing() {
    const snapshot = detailsEditSnapshot.current
    if (snapshot) {
      setDraft(snapshot.draft)
      setEnd(snapshot.end)
      setReviewedItems(snapshot.reviewedItems)
      setFloorPage(0)
      setFieldError(undefined)
      setReason("")
    }
    detailsEditSnapshot.current = undefined
    setDetailsEditing(false)
  }
  function saveDetailsEditing() {
    const checks = [
      ["name", "Enter a project name."], ["address", "Enter a project address or location."],
      ["lot_area", "Enter a lot area greater than zero."],
      ["floor_count", `Enter a whole number of floors from 1 to ${MAX_INQUIRY_FLOORS}.`],
    ] as const
    const invalid = checks.find(([key]) => {
      const value = String(draft[key] ?? "").trim()
      if (!value) return true
      if (key === "lot_area") return !Number.isFinite(Number(value)) || Number(value) <= 0
      if (key === "floor_count") return !Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > MAX_INQUIRY_FLOORS
      return false
    })
    if (invalid) {
      const issue = { id: fieldId(invalid[0]), message: invalid[1] }
      setFieldError(issue)
      document.getElementById(issue.id)?.focus()
      return
    }
    setFieldError(undefined)
    detailsEditSnapshot.current = undefined
    setDetailsEditing(false)
    setDetailsStaged(true)
  }
  function updateDraft(key: string, value: string) {
    setDraft(previous => ({ ...previous, [key]: value }))
    if (key === "floor_count") setFloorPage(0)
    if (["project_type", "lot_area", "floor_count"].includes(key)) {
      setEnd("")
      setReviewedItems(previous => ({ ...previous, floors: false, dates: false }))
    }
  }
  function updateFloorArea(value: typeof floorArea) {
    setFloorArea(value)
    setReviewedItems(previous => ({ ...previous, floors: true, dates: false }))
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
    const locked = !detailsEditing
    const changeValue = (value: string) => { if (detailsEditing) updateDraft(key, value) }
    return <div key={key} className={`office-admin-working-field${changed ? " office-review-field-changed" : ""}`} data-admin-field={key}>
      <label htmlFor={id}>{label}</label>{key === "phone" ? <MobileNumberInput {...describedField(id)} required readOnly={locked} disabled={locked} tabIndex={locked ? -1 : undefined} value={String(draft[key] ?? "")}
          onValueChange={changeValue} />
      : key === "lot_area" ? <GroupedNumberInput {...describedField(id)} required readOnly={locked} disabled={locked} tabIndex={locked ? -1 : undefined} min={0}
        value={String(draft[key] ?? "")} onValueChange={changeValue} />
      : <input {...describedField(id)} type={numeric ? "number" : key === "email" ? "email" : "text"}
          min={numeric ? key === "floor_count" ? 1 : 0 : undefined} step={numeric ? key === "floor_count" ? 1 : "any" : undefined}
          max={key === "floor_count" ? MAX_INQUIRY_FLOORS : undefined} maxLength={numeric ? undefined : key === "address" ? 500 : 150}
          required readOnly={locked} disabled={locked} tabIndex={locked ? -1 : undefined} value={draft[key] ?? ""} onChange={event => changeValue(event.target.value)} />}
      {inlineError(id)}
    </div>
  }
  function currentReviewIssue(form: HTMLFormElement) {
    if (scopeError) return { id: fieldId("project_type"), message: scopeError }
    if (validFloorCount && !calculatedArea) {
      const invalidFloor = floorInputs.findIndex(value => !Number.isFinite(Number(value)) || Number(value) <= 0 || Number(value) > MAX_INQUIRY_AREA)
      const id = floorArea.mode === "same" ? fieldId("area-per-floor") : fieldId(`floor-level-${Math.max(0, invalidFloor) + 1}`)
      return { id, message: `Enter a positive area for every floor, with an average of at least ${MIN_AVERAGE_FLOOR_AREA} m² per floor. The average floor area must not exceed 170% of the lot area.` }
    }
    const controls = form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea")
    for (const control of controls) {
      let message = ""
      if (control.id === "inquiry-completion-date" && (!earliestCompletion || selectedCompletion < earliestCompletion)) {
        message = earliestCompletion ? `Choose ${formatDay(earliestCompletion)} or later.`
          : "Choose a start date and project measurements that produce a completion date within the supported range."
      } else if (control.willValidate) {
        const key = control.id.replace("inquiry-review-", "")
        const value = control.value.trim()
        if (control.id === "inquiry-start-date" && !validStart) message = "Choose an estimated start date at least 14 calendar days from today."
        else if (control.required && !value && !control.validity.badInput) message = "Complete this required field."
        else if (!control.validity.valid) message = key === "phone" ? PH_MOBILE_ERROR : control.validationMessage
        else if (numericField(key) && value && Number(value.replace(/,/g, "")) <= 0) message = "Enter a value greater than zero."
        else if (key === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) message = "Enter a valid personal or business email address."
      }
      if (message) {
        const target = control.disabled ? form.querySelector<HTMLInputElement>("#inquiry-start-date") : control
        if (!target) return
        const label = target.labels?.[0]?.textContent?.replace("Edited", "").trim()
        return { id: target.id, message: label ? `${label}: ${message}` : message }
      }
    }
    if (needsReason && !reason.trim()) return { id: fieldId("reason"), message: "Enter a reason for changes." }
    if (!costEstimate) return { id: fieldId("budget"), message: "Complete the project measurements for a budget estimate." }
    if (budgetError) return { id: fieldId("budget"), message: budgetError }
  }
  useLayoutEffect(() => {
    const issue = reviewing && reviewForm.current ? currentReviewIssue(reviewForm.current) : undefined
    setReviewIssue(previous => previous?.id === issue?.id && previous?.message === issue?.message ? previous : issue)
  })
  function focusReviewIssue(issue: { id: string; message: string }) {
    setFieldError(issue)
    const floor = /^inquiry-review-floor-level-(\d+)$/.exec(issue.id)
    if (floor) setFloorPage(Math.floor((Number(floor[1]) - 1) / floorPageSize))
    const control = document.getElementById(issue.id)
    const panel = control?.closest("details")
    if (panel) panel.open = true
    control?.focus()
  }
  function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (!reviewing) {
      if (costEstimate && !budgetError && !scopeError && event.currentTarget.checkValidity() && !budgetSaved) save("budget", { amount: budget })
      return
    }
    const issue = currentReviewIssue(event.currentTarget)
    if (issue) {
      focusReviewIssue(issue)
      return
    }
    setFieldError(undefined)
    if (!calculatedArea) return
    save("review", { start, end: selectedCompletion, technical, arrangement, amount: budget,
      floorMeasurements: calculatedArea.measurements,
      ...(mixedUse ? { mixed_use_scope: scope } : {}),
      ...(hasCorrections ? { correction: measuredDraft } : {}), ...(needsReason ? { reason } : {}) })
  }
  const budgetFields = <div className="office-review-budget-fields">
    <div>
      <label htmlFor={fieldId("estimated-cost")}>Estimated project cost</label>
      <span className="office-system-label"><Icon name="lock" size={13} />System generated</span>
      <input id={fieldId("estimated-cost")} readOnly value={costEstimate
        ? `${wholePeso.format(costEstimate.minimum)}–${wholePeso.format(costEstimate.maximum)}`
        : "Pending project measurements"} />
      {budgetComplexity && costEstimate && <p className="office-review-field-helper">
        Preliminary estimate based on {budgetComplexity.toLowerCase()} complexity.
      </p>}
    </div>
    <div className="office-review-item" data-review-state={budgetState}>
      <div className="office-item-heading"><ReviewItemStatus state={budgetState} /></div>
      <label htmlFor={fieldId("budget")}>Authorized budget (₱)</label>
      <GroupedNumberInput {...describedField(fieldId("budget"), budgetError ? fieldId("budget-minimum") : undefined)}
        aria-invalid={Boolean(budgetError) || fieldError?.id === fieldId("budget") || undefined}
        normalizeLeadingZeros required min={costEstimate?.minimum ?? 0.01} max={999999999999.99} decimalPlaces={2}
        placeholder="Enter approved amount" value={budget} onValueChange={setBudget} />
      {budgetError ? <p id={fieldId("budget-minimum")} className="office-review-field-error" role="alert">{budgetError}</p>
        : inlineError(fieldId("budget"))}
    </div>
  </div>
  const recordCards = <div className="office-workflow-grid record-cards office-intake-records">
    <Card title="Client information" icon="users"><Facts values={clientFacts} /></Card>
    <Card title="Project information" icon="building"><Facts values={projectFacts} />
      {row.details.overview && <p>{row.details.overview}</p>}
    </Card>
  </div>
  const backToInquiries = <button type="button" className="button office-workflow-back" disabled={busy} onClick={back}>{"\u2190 Back"}</button>
  const steps = [
    ["accepted", "Accepted inquiry", true, true],
    ["proposal", "Client proposal", true, accepted],
    ["review", "Project information & budget", accepted, assessmentAvailable],
    ["assessment", "Project assessment", assessmentAvailable, Boolean(assessment)],
  ] as const
  const workflowNav = <nav className="office-workflow-nav office-intake-record-nav" aria-label="Inquiry workflow">
    {steps.map(([key, label, enabled, complete], index) => {
      const locked = assessmentAvailable && key !== "assessment"
      return <button type="button" className="button" key={key} disabled={busy || !enabled || locked}
        aria-current={page === key ? "step" : undefined} onClick={() => navigate(key)}>
        <span className="office-intake-step-marker" data-complete={complete} aria-hidden="true">{complete ? <Icon name="check" size={14} /> : index + 1}</span>
        <span><strong>{label}</strong><small>{locked ? "Complete · Locked" : page === key ? "Viewing now" : complete ? "Complete" : enabled ? "Available" : "Unavailable"}</small></span>
      </button>
    })}
  </nav>

  return <div className={`office-workflow${compactReview ? " office-review-compact" : ""}`}>
    {showIntakeRecord && backToInquiries}
    {!showIntakeRecord && <div className="office-review-top">
      {backToInquiries}
      {compactReview && showApproval && <div className="office-review-toast">
        <Icon name="check" />
        <div role="status"><strong>Proposal approved</strong><p>{descriptions.review}</p></div>
        <button className="button icon-button" type="button" aria-label="Dismiss approval notice" onClick={() => setShowApproval(false)}><Icon name="close" /></button>
      </div>}
    </div>}
    {showIntakeRecord ? <section className="office-intake-record">
      <div className="office-intake-record-toolbar">
        <span className="inquiry-muted">Inquiry reference {reference}</span>
        <span className={`inquiry-pill ${accepted ? "ready" : "pending"}`}>{accepted ? "Proposal approved" : "Proposal decision pending"}</span>
      </div>
      <header className="office-intake-record-header">
        <div><h1 ref={heading} tabIndex={-1}>{name}</h1>
          <p>{[row.details.project_type, row.details.client_name, row.details.address].filter(Boolean).join(" · ")}</p>
        </div>
        <Facts values={[
          ["Office PM", row.opm_name || "Assigned Office PM"],
          ...(row.updated_at && Number.isFinite(Date.parse(row.updated_at))
            ? [["Last updated", new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(row.updated_at))] as [string, string]] : []),
        ]} />
      </header>
      {workflowNav}
    </section> : null}
    {!compactReview && !showIntakeRecord && <header className="office-workflow-heading">
      <div><p className="inquiry-muted">Inquiry reference {reference}</p><h1 ref={heading} tabIndex={-1}>{title}</h1><p>{descriptions[page]}</p></div>
    </header>}
    {error && <p className="office-workflow-error" role="alert">{error}</p>}
    {busy && <p role="status">Saving or loading inquiry…</p>}

    {page === "pending" && <div className="inquiry-card office-pending-record">
      <Card title="Consultation request" icon="users">
        <div className="office-pending-request">
          <Facts values={[
            ["Inquiry urgency", row.details.classification || "Normal"],
            ["Preferred consultation timing", consultation],
            ...(responseDeadline ? [["Response due", responseDeadline] as [string, string]] : []),
          ]} />
          <div className="office-workflow-actions">
            <button type="button" className="button danger-ghost" disabled={busy} onClick={() => decide("cancel")}>Reject inquiry</button>
            <button type="button" className="button primary" disabled={busy} onClick={() => decide("confirm")}>Accept inquiry</button>
          </div>
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
      <header className="office-intake-section-heading">
        <div><span className="inquiry-pill ready">Inquiry accepted</span><h2>Review the client and project record</h2></div>
        <button type="button" className="button primary" disabled={busy} onClick={() => navigate(accepted ? "review" : "proposal")}>
          {accepted ? "Review project information" : "Open client proposal"} <Icon name="arrow" size={17} />
        </button>
      </header>
      <Notice tone={accepted ? "success" : "warning"}>
        <strong>{accepted ? "Client proposal approved" : "Awaiting client proposal approval"}</strong>
        <p>{accepted ? "Review the project information to continue." : "Project information is read-only until the client approves the proposal."}</p>
      </Notice>
      {recordCards}
    </>}

    {page === "proposal" && <div className="office-workflow-grid office-proposal-grid">
      <Card title="Proposal decision" icon="doc">
        <div className="office-proposal-summary">
          <span className="inquiry-list-icon" aria-hidden="true">{initials(name)}</span>
          <h3>{name}</h3>
          <span className={`inquiry-pill ${accepted ? "ready" : "pending"}`}>{accepted ? "Approved" : "Pending client approval"}</span>
        </div>
        <Facts values={[
          ["Client", amount(row.details.client_name)],
          ["Office PM", row.opm_name || "Assigned Office PM"],
        ]} />
        {row.details.overview && <div className="office-proposal-scope"><h3>Project overview</h3><p>{row.details.overview}</p></div>}
        {workflow?.revisions?.map(({ date: day, note }, index) =>
          <Notice key={index}><strong>Revision requested · {formatDay(day)}</strong><p>{note}</p></Notice>)}
      </Card>
      <Card title="Client decision" icon="check">
        {!accepted ? <form onSubmit={event => {
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
                  <button type="button" className="button danger-ghost" onClick={() => setProposalAction("withdraw")}>Client Dropped Project</button>
                <button type="button" className="button" onClick={() => setProposalAction("revise")}>Revision Request</button>
              </>}
              <button className={`button ${proposalAction === "withdraw" ? "danger" : "primary"}`} type="submit">
                {proposalAction === "revise" ? "Save revision request" : proposalAction === "withdraw" ? "Confirm client dropped project" : "Mark proposal approved"}
              </button>
            </div>
          </fieldset>
        </form> : <>
          <Notice tone="success"><strong>Proposal approved</strong>
            <p>{assessmentAvailable ? "The project information and budget are saved. Project assessment is available."
              : "Review the project information and save the authorized budget to unlock assessment."}</p>
          </Notice>
          {row.details.client_decision_date && <Facts values={[["Decision confirmed", formatDay(String(row.details.client_decision_date))]]} />}
          {row.details.client_decision_note && <div className="office-proposal-scope"><h3>Internal note</h3><p>{row.details.client_decision_note}</p></div>}
          <div className="office-workflow-actions">
            <button className="button primary" type="button" disabled={busy} onClick={() => navigate("review")}>
              Review project information <Icon name="arrow" size={17} />
            </button>
          </div>
        </>}
      </Card>
    </div>}

    {page === "review" && <>
      <div className={reviewing ? "office-review-layout" : undefined}>
        {reviewing && <aside className="inquiry-card office-admin-submission" aria-labelledby="office-admin-submission-title">
          <header className="office-review-panel-heading">
            <h2 id="office-admin-submission-title"><Icon name="lock" size={17} /> Admin submission</h2>
            <span className="inquiry-pill"><Icon name="lock" size={13} /> View only</span>
          </header>
          <Facts values={[
            ...correctionFields.map(([key, label]): [string, string | number] => [label, amount(original[key] ?? undefined)]),
            ["Estimated start", row.details.anticipated_start ? formatDay(String(row.details.anticipated_start)) : "Not provided"],
            ["Classification", row.details.classification || "Normal"],
          ]} />
          {row.details.overview && <p>{row.details.overview}</p>}
        </aside>}
      <form ref={reviewForm} className="office-workflow-form" noValidate={reviewing} onSubmit={submitReview} onChange={event => {
        if ((event.target as HTMLElement).id === fieldError?.id) setFieldError(undefined)
      }}>
        {reviewing ? <fieldset className="inquiry-card office-review-form" disabled={busy}>
          <header className="office-review-panel-heading">
            <div><span className="inquiry-muted">Step 2 of 3</span><h1 ref={heading} tabIndex={-1}>{title}</h1></div>
            <span className="inquiry-pill">Live estimate</span>
          </header>
          <div className="office-project-details-heading" data-editing={detailsEditing}>
            <div><h2>Project details {detailsEditing ? <span className="office-editing-badge" role="status">Editing</span>
              : detailsStaged && <span className="office-details-staged" role="status">Edits ready</span>}</h2>
              <p>{detailsEditing ? "Save editing to finish this section, or cancel editing to restore its previous values."
                : detailsStaged ? "Edits are ready in this form. Use Save and continue to submit them."
                  : "Submitted project details are read only. Choose Edit project details to make changes."}</p></div>
            {detailsEditing ? <div className="office-project-details-actions">
                <button type="button" className="button" onClick={cancelDetailsEditing}>Cancel editing</button>
                <button type="button" className="button primary" disabled={!detailsChanged} onClick={saveDetailsEditing}>Save editing</button>
              </div>
              : <button type="button" className="button" onClick={() => {
                detailsEditSnapshot.current = { draft: { ...draft }, end, reviewedItems: { ...reviewedItems } }
                setDetailsEditing(true)
              }}>Edit project details</button>}
          </div>
          <section className="office-workflow-subsection" aria-labelledby={fieldId("client-information")}>
            <h3 id={fieldId("client-information")}>Client information <span className="inquiry-pill">Read only</span></h3>
            <p className="office-review-field-helper">Provided by Admin. Client corrections follow the existing approval process.</p>
            <Facts values={clientFacts} />
          </section>
          <div className="office-workflow-fields">
            {projectIdentityFields.slice(0, 2).map(([key, label]) => editField(key, label))}
          </div>
          <section className="office-workflow-subsection" aria-labelledby={fieldId("measurements")}>
            <h3 id={fieldId("measurements")}>Project measurements</h3>
            <div className="office-workflow-fields">
              <div className="office-project-type-field office-static-project-type">
                <label htmlFor={fieldId("project_type")}>Project type</label>
                <input id={fieldId("project_type")} readOnly disabled tabIndex={-1} value={String(row.details.project_type ?? "")} />
              </div>
              {mixedUse && <div className="office-project-type-field">
                <fieldset className="inquiry-mixed-use-options">
                  <legend>Building uses</legend>
                  <p>Select at least two uses.</p>
                  {MIXED_USE_USES.map(({ code, label }) => <label key={code} className="inquiry-check">
                    <input type="checkbox" checked={scope.uses.includes(code)} onChange={event => {
                      const checked = event.target.checked
                      setScope(previous => ({ ...previous, uses: checked ? [...previous.uses, code] : previous.uses.filter(use => use !== code) }))
                    }} />{label}
                  </label>)}
                </fieldset>
                <fieldset className="inquiry-mixed-use-options">
                  <legend>Construction features</legend>
                  <p>Select the features included in the design.</p>
                  {MIXED_USE_FEATURES.map(({ code, label }) => <label key={code} className="inquiry-check">
                    <input type="checkbox" checked={scope.features[code]} onChange={event => {
                      const checked = event.target.checked
                      setScope(previous => ({ ...previous, features: { ...previous.features, [code]: checked } }))
                    }} />{label}
                  </label>)}
                </fieldset>
              </div>}
              {projectMeasurementFields.map(([key, label]) => editField(key, label))}
            </div>
            <div className="office-review-item office-floor-review" data-review-state={floorState}>
              <div className="office-item-heading"><h4>Floor sizes</h4><ReviewItemStatus state={floorState} />
                {floorState === "review" && <button type="button" className="button office-review-confirm" onClick={() => markReviewed("floors")}>Confirm floor sizes</button>}
              </div>
              <div className="office-workflow-fields office-floor-inputs">
              <label>Floor sizes<select value={floorArea.mode} onChange={event => {
                const mode = event.target.value === "individual" ? "individual" : "same"
                updateFloorArea({ ...floorArea, mode, areas: mode === "individual" && !floorArea.areas.length && validFloorCount
                  ? Array.from({ length: floorCount }, () => perFloor) : floorArea.areas })
                setFloorPage(0)
              }}><option value="same">All floors have the same area</option><option value="individual">Enter each floor separately</option></select></label>
              {floorArea.mode === "same" ? <div className={`office-floor-area-field${editedAreaPerFloor ? " office-review-field-changed" : ""}`}>
                <label htmlFor={fieldId("area-per-floor")}>Area per floor (m²)</label>
                <GroupedNumberInput {...describedField(fieldId("area-per-floor"), floorArea.perFloor === null ? fieldId("area-per-floor-hint") : undefined)} required min={areaRange?.minimumAverage ?? MIN_AVERAGE_FLOOR_AREA} max={areaRange?.maximumAverage} value={perFloor}
                  onValueChange={value => updateFloorArea({ ...floorArea, perFloor: value })} />
                {floorArea.perFloor === null && <div className="office-review-field-helper" id={fieldId("area-per-floor-hint")}>
                  {averageOutsideCorrectedLot
                    ? "The submitted average is outside the supported range for the corrected lot area. Enter the actual area per floor."
                    : perFloor ? "Prefilled with the submitted average. Update it if the floor area has changed."
                    : "Enter the actual area per floor."}
                </div>}
                {inlineError(fieldId("area-per-floor"))}
              </div> : floorInputs.slice(floorPage * floorPageSize, (floorPage + 1) * floorPageSize).map((value, offset) => {
                const index = floorPage * floorPageSize + offset
                const id = fieldId(`floor-level-${index + 1}`)
                const changed = areaWasEdited(value)
                return <div key={id} className={`office-floor-area-field${changed ? " office-review-field-changed" : ""}`}>
                  <label htmlFor={id}>Floor {index + 1} area (m²)</label>
                  <GroupedNumberInput {...describedField(id)} required min={0} max={MAX_INQUIRY_AREA} value={value} onValueChange={nextArea => {
                    const areas = [...floorArea.areas]
                    areas[index] = nextArea
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
            <p className="office-review-field-helper">Total floor area is the sum of all floors. The average must be at least 20 m² per floor and may exceed the lot area by up to 70%.</p>
            </div>
            <div className="office-workflow-fields office-floor-estimate" aria-live="polite">
              <span className="office-system-label"><Icon name="lock" size={13} />System generated</span>
              <div><span>Total floor area</span><strong>{calculatedArea ? `${calculatedArea.total.toLocaleString("en-PH", { maximumSignificantDigits: 15 })} m²` : "Enter the floor areas"}</strong>
              </div>
              <div><span>Project size</span>
                <div className="office-review-size">{size ? <>{originalSize && originalSize !== size && `${originalSize} → `}<strong>{size}</strong></> : "Pending measurements"}</div>
              </div>
            </div>
          </section>
          {([
            ["Technical requirements", "review-technical", technicalOptions, technical, setTechnical],
            ["Project phase arrangement", "review-arrangement", arrangementOptions, arrangement, setArrangement],
          ] as const).map(([label, group, options, value, select]) => <fieldset key={group} className="office-review-options office-review-item" data-review-state={reviewedItems[group === "review-technical" ? "technical" : "arrangement"] ? "complete" : "review"}>
            <legend>{label} <ReviewItemStatus state={reviewedItems[group === "review-technical" ? "technical" : "arrangement"] ? "complete" : "review"} /></legend>
            {!reviewedItems[group === "review-technical" ? "technical" : "arrangement"] && <p className="office-review-field-helper">Select an option to mark this section reviewed.</p>}
            {mixedUse && group === "review-technical" && <p>Choose based on specialized systems. Podium, tower, and curtain wall are scored from Construction features.</p>}
            <div>{options.map(option => <label key={option}>
              <input type="radio" name={group} value={option} checked={value === option}
                onClick={() => markReviewed(group === "review-technical" ? "technical" : "arrangement")}
                onChange={() => { select(option); setEnd(""); setReviewedItems(previous => ({ ...previous, [group === "review-technical" ? "technical" : "arrangement"]: true, dates: false })) }} />
              {option}
            </label>)}</div>
          </fieldset>)}
          <section className="office-review-item office-date-review" data-review-state={dateState}>
            <div className="office-item-heading"><h4>Estimated dates</h4><ReviewItemStatus state={dateState} />
              {dateState === "review" && <button type="button" className="button office-review-confirm" onClick={() => markReviewed("dates")}>Confirm dates</button>}
            </div>
          <div className="office-workflow-fields">
              <div>
                <label htmlFor="inquiry-start-date">Estimated start date</label>
                <DatePicker {...describedField("inquiry-start-date")} calendarTitle="Estimated start date"
                  calendarSubtitle="Allow 14 calendar days for preparation."
                  required disabled={busy} min={earliestStart} max={latestInquiryStart} value={start} onValueChange={value => {
                    markReviewed("dates")
                    setStart(value)
                    setEnd("")
                    setFieldError(undefined)
                  }} />
                <p className="office-review-field-helper">Earliest start: {earliestStart} (14 calendar days from today).</p>
                {inlineError("inquiry-start-date")}
              </div>
              <div>
                <label htmlFor="inquiry-completion-date">Estimated completion date</label>
                <DatePicker {...describedField("inquiry-completion-date", "inquiry-completion-hint")} calendarTitle="Estimated completion date"
                  calendarSubtitle={earliestCompletion && `Select ${formatDay(earliestCompletion)} or later.`}
                  required disabled={busy || !earliestCompletion} value={selectedCompletion} min={earliestCompletion} highlightMin
                  onValueChange={value => { markReviewed("dates"); setEnd(value); setFieldError(undefined) }} />
                {inlineError("inquiry-completion-date")}
                <p className="office-review-field-helper" id="inquiry-completion-hint">{earliestCompletion ? `Earliest completion: ${formatDay(earliestCompletion)}`
                  : validStart ? "Review the inputs for a completion estimate." : "Select a valid start date first."}</p>
              </div>
            </div>
          </section>
            <div className={`office-workflow-fields office-review-budget${needsReason ? "" : " single"}`}>
              {budgetFields}
              {needsReason && <div className="office-review-reason">
                <label htmlFor={fieldId("reason")}>Reason for changes</label>
                <textarea {...describedField(fieldId("reason"), reason.length > 0 && !reason.trim() ? "inquiry-review-reason-error" : undefined)}
                  aria-invalid={reason.length > 0 && !reason.trim() || fieldError?.id === fieldId("reason") || undefined}
                  required rows={5} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} />
                {reason.length > 0 && !reason.trim() ? <p className="office-review-field-error" id="inquiry-review-reason-error" role="alert">Enter a reason for changes.</p>
                  : inlineError(fieldId("reason"))}
              </div>}
            </div>
          {signedContract}
          <div className="office-review-footer">
            <div className="office-review-duration" aria-live="polite">
              <span className="inquiry-list-icon"><Icon name="clock" /></span>
              <div><span>Estimated project duration</span>
                <strong>{scheduleEstimate?.planningDays != null && Number.isFinite(scheduleEstimate.planningDays)
                  ? `${scheduleEstimate.planningDays.toLocaleString("en-PH")} calendar days` : "Pending measurements"}</strong>
                {scheduleEstimate && <span>{scheduleEstimate.complexity} complexity</span>}
              </div>
            </div>
            {reviewIssue && <p className="office-review-field-error" id="inquiry-review-guidance" role="status">
              <a href={`#${reviewIssue.id}`} onClick={event => { event.preventDefault(); focusReviewIssue(reviewIssue) }}>{reviewIssue.message}</a>
            </p>}
            <div className="office-workflow-actions">
              {editing && <button type="button" className="button" onClick={() => {
                setEditing(false)
                setStart(review?.start ?? String(row.details.anticipated_start ?? ""))
                setEnd(review?.end ?? "")
                setTechnical(assessment?.technical ?? review?.technical ?? technicalOptions[0])
                setArrangement(assessment?.arrangement ?? review?.arrangement ?? arrangementOptions[0])
                setBudget(String(workflow?.budget ?? ""))
                if (review?.mixed_use_scope) setScope(review.mixed_use_scope)
                setReason("")
                setFieldError(undefined)
              }}>Cancel</button>}
              <button type="submit" className="button primary" aria-describedby={reviewIssue ? "inquiry-review-guidance" : undefined}
                disabled={busy || !!reviewIssue || !costEstimate || Boolean(budgetError) || Boolean(scopeError)}>Save and continue</button>
            </div>
          </div>
        </fieldset> : <fieldset className="office-workflow-form office-reviewed-intake" disabled={busy}>
          <Card title="Reviewed intake details" icon="building" actions={
            <button type="button" className="button" onClick={startEditing}>Edit project information</button>
          }>
            <Facts values={[
              ["Lot area (m²)", amount(row.details.lot_area)],
              ["Number of floors", amount(row.details.floor_count)],
              ["Total floor area (m²)", amount(row.details.floor_area_sqm)],
              ["Authorized budget", workflow?.budget == null ? "Not saved" : currency.format(workflow.budget)],
              ["Technical requirements", review?.technical ?? technicalOptions[0]],
            ]} />
            <details className="office-workflow-history"><summary>Client information and schedule</summary>
              <Facts values={[...clientFacts, ...projectFacts.filter(([label]) =>
                ["Project address / location", "Estimated start", "Estimated completion", "Classification"].includes(label))]} />
              {row.details.overview && <p>{row.details.overview}</p>}
            </details>
          <details className="office-workflow-history" open={!budgetSaved || undefined}>
            <summary>Budget allocation</summary>
            {budgetFields}
            {!!workflow?.budget_history?.length && <details className="office-workflow-history"><summary>Budget change history</summary>
              <ul>{workflow.budget_history.map(({ at, amount }, index) => <li key={index}>{formatDay(at)} · {currency.format(amount)}</li>)}</ul>
            </details>}
          </details>
          <div className="office-workflow-actions office-workflow-action-bar">
            {budgetSaved
              ? <p className="inquiry-muted">Update the reviewed schedule to continue to assessment.</p>
              : <button type="submit" className="button primary" disabled={!costEstimate || Boolean(budgetError)}>Save allocated budget</button>}
          </div>
          </Card>
          {signedContract}
        </fieldset>}
      </form>
      </div>
      {!!workflow?.review_history?.length && <details className="office-workflow-history"><summary>Project information audit history</summary>
        <ol>{workflow.review_history.map(event => <li key={event.version}>
          <strong>Version {event.version} · {formatDay(event.at)}</strong> {event.reason || "Information confirmed"}
          {!!Object.keys(event.changes).length && <ul>{Object.entries(event.changes).map(([key, change]) =>
            <li key={key}>{key.replace(/_/g, " ")} changed from {amount(change.before ?? undefined)} to {amount(change.after ?? undefined)}</li>)}</ul>}
        </li>)}</ol>
      </details>}
    </>}

    {page === "assessment" && preview && review && <>
    <header className="office-intake-section-heading">
      <div><h2>{title}</h2><p className="inquiry-muted">{descriptions.assessment}</p></div>
      <div className="office-workflow-actions">
        {!assessment && <button type="button" className="button primary" disabled={busy || assessmentNeedsDates}
          onClick={() => save("assessment", { technical, arrangement })}>Complete assessment</button>}
        <button type="button" className="button primary" disabled={busy || !assessment || !hasSignedContract}
          aria-describedby={(!assessment || !hasSignedContract) ? "inquiry-contract-requirement" : undefined}
          onClick={() => { if (!busy && assessment && hasSignedContract) startStaffing() }}>
          Continue to construction phases</button>
        {(!assessment || !hasSignedContract) && <p id="inquiry-contract-requirement" className="inquiry-muted" role="status">
          {!assessment ? "Complete the assessment first." : "Upload the signed client contract."}
        </p>}
      </div>
    </header>
    {assessmentNeedsDates && <Notice tone="warning">
      <p>{minimumReviewedEnd
        ? `This assessment requires a completion date of ${formatDay(minimumReviewedEnd)} or later.`
        : "The estimated completion is outside the supported date range."} Choose assessment settings that fit the saved schedule.</p>
      <button type="button" className="button" onClick={() => {
        setTechnical(review.technical ?? technicalOptions[0])
        setArrangement(review.arrangement ?? arrangementOptions[0])
      }}>Restore reviewed settings</button>
    </Notice>}
    <div className="office-workflow-grid assessment">
      <Card title="Project size classification" icon="building" assessmentMetric="size">
        <Facts values={[
          ["Project type", amount(row.details.project_type)],
          ["Lot area", row.details.lot_area ? `${assessmentNumber.format(Number(row.details.lot_area))} m²` : "Not provided"],
          ["Total floor area", row.details.floor_area_sqm ? `${assessmentNumber.format(Number(row.details.floor_area_sqm))} m²` : "Not provided"],
          ["Floors", amount(row.details.floor_count)],
        ]} />
        <div className="office-workflow-result office-assessment-size">
          <div><span>Classification</span><strong>{preview.size}</strong>
            <p>{assessmentBasis ? "Uses the higher size category from the reviewed lot area and total floor area."
              : "Size recorded when this assessment was completed."}</p>
          </div>
          <span className="office-assessment-size-mark" aria-hidden="true">{preview.size.charAt(0)}</span>
        </div>
        {projectSizes.includes(preview.size) && <ul className="office-assessment-size-scale" aria-label="Project size categories">
          {projectSizes.map(size => <li key={size} aria-current={size === preview.size ? "true" : undefined}>{size}</li>)}
        </ul>}
        {assessmentBasis?.size === "Large" && <p className="office-assessment-size-note">Large if the lot exceeds {assessmentNumber.format(assessmentBasis.medium[0])} m² or the total floor area exceeds {assessmentNumber.format(assessmentBasis.medium[1])} m² for this project type.</p>}
      </Card>
      <Card title="Complexity classification" icon="doc" assessmentMetric="complexity">
        <fieldset className="office-workflow-form" disabled={busy || !!assessment}>
          <label>Technical requirements<select value={technical} onChange={event => setTechnical(event.target.value)}>{technicalOptions.map(option => <option key={option}>{option}</option>)}</select></label>
          <label>Project phase arrangement<select value={arrangement} onChange={event => setArrangement(event.target.value)}>{arrangementOptions.map(option => <option key={option}>{option}</option>)}</select></label>
        </fieldset>
        <div className="office-workflow-result office-assessment-complexity">
          <div className="office-assessment-ring" style={{ backgroundImage: `conic-gradient(#755294 ${preview.score / 15 * 100}%, #dfd9e6 0)` }}>
            <span>{preview.score}<small>/ 15</small></span>
          </div>
          <div><span>Complexity score</span><strong>{preview.complexity}</strong></div>
        </div>
        {assessmentBasis ? <details className="office-assessment-basis office-score-breakdown">
          <summary>View score breakdown <Icon name="chevron" size={18} /></summary>
          <dl className="office-assessment-score-list">
            {([
              ["Project type", assessmentBasis.typePoints], ["Project size", assessmentBasis.sizePoints],
              ["Technical requirements", assessmentBasis.technicalPoints],
              ["Phase arrangement", assessmentBasis.overlapPoints],
            ] as const).map(([label, points]) => <div key={label}>
              <dt>{label}</dt><dd><meter value={points} min={0} max={3} aria-hidden="true" /><span>{points}/3</span></dd>
            </div>)}
          </dl>
          {mixedUse && <p>Mixed-Use scope adds {assessmentBasis.usePoints} for additional building uses and {assessmentBasis.featurePoints} for podium, tower, and curtain wall features. Scores are capped at 15.</p>}
          <p>Low is 4–7 points, Moderate is 8–11, and High is 12–15.</p>
        </details> : <p>Planning score recorded when this assessment was completed.</p>}
      </Card>
      <Card title="Estimated project duration" icon="clock" assessmentMetric="duration">
        <div className="office-workflow-result duration">
          {preview.planningDays != null && <><strong>About {durationLabel(preview.planningDays)}</strong>
            <span>{preview.planningDays.toLocaleString("en-PH")} estimated calendar days</span></>}
          {preview.durationMultiplier != null && <p>Schedule multiplier ×{preview.durationMultiplier.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</p>}
        </div>
        <div className="office-assessment-schedule">
          <Facts values={[["Reviewed start", formatDay(review.start)], ["Reviewed completion", formatDay(review.end)]]} />
          <div className="office-assessment-date-line" aria-hidden="true" />
          <p>{preview.durationDays.toLocaleString("en-PH")} reviewed calendar days</p>
          {preview.suggestedEnd && <p>Suggested completion: {formatDay(preview.suggestedEnd)}</p>}
        </div>
        {assessmentBasis && <details className="office-assessment-basis"><summary>View duration calculation</summary>
          <p>({assessmentNumber.format(Number(row.details.floor_area_sqm))} m² × {assessmentBasis.rate} days/m² + {assessmentNumber.format(assessmentBasis.extraFloorDays)} days for floors above the first) × {assessmentBasis.complexityFactor} × {assessmentBasis.overlapFactor}, rounded up.</p>
          <p>The ×{assessmentBasis.complexityFactor} factor reflects {assessmentBasis.baselineComplexity.toLowerCase()} complexity before adding overlap points. The ×{assessmentBasis.overlapFactor} factor reflects the selected phase arrangement.</p>
        </details>}
        {assessment && <Notice tone="success"><strong>Assessment completed</strong><p>{!hasSignedContract
          ? "Attach the signed client contract below to continue to Site PM staffing."
          : "Review construction phases to continue to Site PM staffing."}</p></Notice>}
      </Card>
    </div>
    {signedContract}
    </>}
  </div>
}

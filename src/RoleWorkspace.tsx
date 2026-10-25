import OverallProjectProgress from "./OverallProjectProgress"
import ProjectProgress from "./ProjectProgress"
import MonthlyReport from "./MonthlyReport"
import Reports from "./Reports"
import ProjectClientDetails from "./ProjectClientDetails"
import PhaseHandoff from "./PhaseHandoff"
import MyProfile from "./MyProfile"
import EvidenceReview from "./EvidenceReview"
import ChecklistApprovalBanner from "./ChecklistApprovalBanner"
import DashboardWelcome from "./DashboardWelcome"
import SitePhotoGallery from "./SitePhotoGallery"
import { NotificationSaveStatus, type NotificationSaveState } from "./useNotificationSettings"
import type { LoginGreeting } from "./dashboard-greeting"
import ReworkReview from "./ReworkReview"
import IntakeGuidance, { IntakeTabs } from "./IntakeGuidance"
import { intakeGuidance, intakeViewCounts, isIntake, type IntakeView } from "./intake-guidance"
import NavigationCount from "./NavigationCount"
import { navigationAttention } from "./navigation-attention"
import { hasPendingSiteReview } from "./active-sites-review"
import { normalizeWorkspacePage } from "./adminNav"
import ActiveSites from "./ActiveSites"
// @refresh reset
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import LeadSubcontractorPanel, {
  SubcontractorAllocationReadOnly,
} from "./LeadSubcontractorPanel"
import PhaseTimeline from "./PhaseTimeline"
import PlannedTimeline from "./PlannedTimeline"
import { Badge, Button, Empty, Field, Icon, Modal } from "./ui"
import { checklistFeedback } from "./checklistFeedback"
import ReportRejectDialog from "./ReportRejectDialog"
import { LicenseBanner, ReassignRequests, WorkRecord } from "./LicenseWorkflow"
import { DocumentList, downloadDoc, Preview, Upload } from "./panels"
import {
  CompactPager,
  ListPager,
  ListSection,
  ListToolbar,
  NoResults,
  runList,
  getListQuery,
  updateListQuery,
  useListMemory,
} from "./ListControls"
import { inDateRange, optionsFrom, withPage, type FilterDef } from "./listing"

type DeadlineEntry = {
  key: string
  projectId: string
  projectName: string
  kind: string
  due?: number
  node: ReactNode
}
import DocumentRepository, {
  findIndexedDoc,
  staffRepositoryCategories,
  type RepositoryPath,
} from "./DocumentRepository"
import { projectDocumentIndexFor } from "./project-document-index"
import {
  dateLabel,
  DOC_LABELS,
  initials,
  licenseState,
  projectPhaseDisciplines,
  projectPhaseNames,
  ROLE_NAMES,
  PROJECT_TYPES,
  spmCandidates,
  uid,
  today,
  type Account,
  type Company,
  type Doc,
  fileSizeLabel,
  submissionDocs,
  type Event as WorkspaceEvent,
  type Project,
  type State,
} from "./model"
import {
  allocationReady,
  activeSubcontractors,
  assignmentBlock,
  checklistFor,
  ISSUES,
  isAssigned,
  leadConfirmed,
  officePmStage,
  leadId,
  ownedProjects,
  phaseOwner,
  registeredComplete,
  registeredCount,
  REVIEW_MS,
  teamConfirmed,
  visibleEvents,
  workflowFor,
  type WorkflowCommand,
} from "./workflows"

function Panel({
  title,
  subtitle,
  children,
  actions,
  className = "",
}: {
  title: string
  subtitle?: string
  children: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-header">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  )
}
function Status({ value }: { value: string }) {
  return (
    <Badge
      tone={
        ["accepted", "confirmed", "approved", "active"].includes(value)
          ? "green"
          : ["declined", "expired", "rejected"].includes(value)
            ? "red"
            : "amber"
      }
    >
      {value.replace(/_/g, " ")}
    </Badge>
  )
}
const OPM_NAV = [
  ["Dashboard", "grid"],
  ["Confirmation queue", "check"],
  ["Documents", "folder"],
  ["Active sites", "building"],
  ["Deadlines", "clock"],
  ["Rework & approvals", "shield"],
  ["Archive", "archive"],
  ["Activity log", "activity"],
  ["Preferences", "settings"],
  ["Reports", "doc"],
]
const SPM_NAV = [
  ["Dashboard", "grid"],
  ["Assignments", "check"],
  ["Active sites", "building"],
  ["Deadlines", "clock"],
  ["Document repository", "folder"],
  ["Subcon directory", "users"],
  ["Archive", "archive"],
  ["Activity log", "activity"],
  ["Preferences", "settings"],
  ["Reports", "doc"],
]
type Result = {
  ok: boolean
  error?: string
  message?: string
}
type RoleDialog = {
  kind: string
  projectId?: string
  companyId?: string
  phase?: string
}
export default function RoleWorkspace({
  state,
  actor,
  welcomeGreeting,
  notificationSave,
  onCommand,
  onRead,
  onMute,
  paused,
  idleWarning,
  onStayActive,
  onResume,
  onPause,
  onReload,
}: {
  state: State
  actor: Account
  welcomeGreeting?: LoginGreeting
  notificationSave?: NotificationSaveState
  onCommand: (command: WorkflowCommand) => Result | Promise<Result>
  onRead: (ids: string[]) => void
  onMute: (type: string) => void
  paused: boolean
  idleWarning: boolean
  onStayActive: () => void
  onResume: () => void
  onPause: () => void
  onReload: () => unknown
}) {
  const isOpm = actor.role === "opm"
  useListMemory()
  const nav = isOpm ? OPM_NAV : SPM_NAV
  const projects = ownedProjects(state, actor)
  const navigationCounts = navigationAttention(state, actor)
  const [page, setPage] = useState("Dashboard")
  const [profileOpen, setProfileOpen] = useState(false)
  const [pickedId, setPickedId] = useState(
    () =>
      projects.find((p) => p.status === "pending")?.id || projects[0]?.id || "",
  )
  const [dialog, setDialog] = useState<RoleDialog>()
  const [reportProjectId,setReportProjectId]=useState("")
  // Project Monitoring modal: one modal that switches between its monitoring
  // content and the project repository. Reset whenever the modal closes.
  const [monitorView, setMonitorView] = useState<"monitoring" | "repository">(
    "monitoring",
  )
  const [repoPath, setRepoPath] = useState<RepositoryPath>({})
  const [repoQuery, setRepoQuery] = useState("")
  const monitorScroll = useRef(0)
  const modalBody = useRef<Element | null>(null)
  // Runs right after the modal switches views: the repository starts at the
  // top, and Project Monitoring returns to where it was.
  useLayoutEffect(() => {
    if (modalBody.current)
      modalBody.current.scrollTop =
        monitorView === "repository" ? 0 : monitorScroll.current
  }, [monitorView])
  useEffect(() => {
    if (dialog?.kind === "project") return
    setMonitorView("monitoring")
    setRepoPath({})
    setRepoQuery("")
    monitorScroll.current = 0
  }, [dialog?.kind, dialog?.projectId])
  const [preview, setPreview] = useState<Doc>()
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [tab, setTab] = useState("progress")
  const [archiveTab, setArchiveTab] = useState("completed")
  const [confirmTab, setConfirmTab] = useState("mine")
  const [intakeView, setIntakeView] = useState<IntakeView>("all")
  const [assignmentIntakeView, setAssignmentIntakeView] = useState<IntakeView>("all")
  const [mobileNav, setMobileNav] = useState(false)
  const [bell, setBell] = useState(false)
  const [acceptedId, setAcceptedId] = useState("")
  const [note, setNote] = useState("")
  const [issueChoices, setIssueChoices] = useState<string[]>([])
  const [affectedActivities,setAffectedActivities]=useState<string[]>([])
  useEffect(()=>setAffectedActivities([]),[pickedId])
  const [evidence, setEvidence] = useState<Doc>()
  const [evidenceReview,setEvidenceReview]=useState<WorkflowCommand>()
  const [diary, setDiary] = useState("")
  const [declineReason, setDeclineReason] = useState("")
  const [assignmentSort, setAssignmentSort] = useState("recommended")
  const [assignmentFilter, setAssignmentFilter] = useState("all")
  const [assignmentId, setAssignmentId] = useState("")
  const [reviewAction, setReviewAction] = useState<WorkflowCommand>()
  // Ordinary progress report being rejected (separate from checklist evidence and rework decisions).
  const [reportReject, setReportReject] = useState<{ projectId: string; projectName: string; expectedVersion: number }>()
  const [activityFilter, setActivityFilter] = useState("all")
  const [companyAvailabilityFilter, setCompanyAvailabilityFilter] =
    useState("all")
  const [completedProjectId, setCompletedProjectId] = useState("")
  const previousStatuses = useRef(
    Object.fromEntries(projects.map((p) => [p.id, p.status])),
  )
  const picked = projects.find((p) => p.id === pickedId) || projects[0]
  const detail = state.projects.find((p) => p.id === dialog?.projectId)
  const company = state.companies.find((c) => c.id === dialog?.companyId)
  const events = visibleEvents(state, actor)
  const muted = state.userPreferences?.[actor.id] || []
  const unread = events.filter(
    (e) =>
      !e.readBy?.includes(actor.id) &&
      !muted.includes(e.type) &&
      ["request", "approval", "progress", "notice"].includes(e.type),
  ).length
  const allActive = projects.filter((p) => p.status === "active")
  const active = allActive.filter(
    (p) =>
      isOpm ||
      phaseOwner(p) === actor.id ||
      p.team.some(
        (t) =>
          t.accountId === actor.id &&
          projectPhaseNames(p).indexOf(t.phase) <
            projectPhaseNames(p).indexOf(p.phase),
      ),
  )
  const intakes = projects.filter((p) =>
    ["pending", "changes_requested", "draft"].includes(p.status),
  )
  const requestProjects = projects.filter(
    (p) => p.status === "active" || p.status === "pending",
  )
  const tasks = projects.filter((p) =>
    isOpm
      ? p.status === "pending" && !p.opmAccepted
      : !assignmentBlock(p, actor.id) &&
        p.team.some((t) => t.accountId === actor.id && t.status === "pending"),
  )
  // Projects with a Site PM phase that is still pending or declined.
  const responseProjects = projects.filter(
    (p) =>
      p.opmAccepted ||
      workflowFor(p).responses.length ||
      p.status === "pending",
  )
  const responsesNeedingAction = responseProjects.filter((p) =>
    p.team.some((t) => t.status !== "confirmed"),
  )
  const pendingUpdates = allActive.filter((p) => workflowFor(p).pendingUpdate)
  const pendingRework = allActive.filter((p) => workflowFor(p).pendingRework)
  const qaCount = allActive.reduce(
    (n, p) =>
      n + checklistFor(p).filter((i) => i.status === "submitted").length,
    0,
  )
  const actorName = (id: string) =>
    state.accounts.find((a) => a.id === id)?.name || "Unassigned"
  const selectedProjectName = (id: string) =>
    state.projects.find((p) => p.id === id)?.name || "Project"
  useEffect(() => {
    const justCompleted = projects.find(
      (p) =>
        p.status === "completed" && previousStatuses.current[p.id] === "active",
    )
    previousStatuses.current = Object.fromEntries(
      projects.map((p) => [p.id, p.status]),
    )
    if (justCompleted) setCompletedProjectId(justCompleted.id)
  }, [state.projects])
  useEffect(() => {
    setNote("")
    setIssueChoices([])
    setEvidence(undefined)
    setDiary("")
  }, [pickedId, picked?.phase])
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(""), 5000)
    return () => clearTimeout(timer)
  }, [message])
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest(".notification-container"))
        setBell(false)
    }
    window.addEventListener("pointerdown", close)
    return () => window.removeEventListener("pointerdown", close)
  }, [])
  // Search, filters and paging. Every list starts from role-scoped data
  // (ownedProjects / visibleEvents), so filters can only narrow what this role
  // is already allowed to see.
  const projectText = (p: Project) => `${p.name} ${p.type} ${p.phase}`
  const typeFilterP = (items: Project[]): FilterDef<Project> => ({
    id: "type",
    label: "Project type",
    allLabel: "All types",
    options: optionsFrom(items.map((p) => p.type)),
    test: (p, value) => p.type === value,
  })
  const phaseFilterP = (items: Project[]): FilterDef<Project> => ({
    id: "phase",
    label: "Phase",
    allLabel: "All phases",
    options: optionsFrom(items.map((p) => p.phase)),
    test: (p, value) => p.phase === value,
  })
  const dateFilters = <T,>(
    pick: (item: T) => string | undefined,
    noun: string,
  ): FilterDef<T>[] => [
    {
      id: "from",
      label: `${noun} from`,
      kind: "date",
      test: (item, value) => inDateRange(pick(item), value),
    },
    {
      id: "to",
      label: `${noun} to`,
      kind: "date",
      test: (item, value) => inDateRange(pick(item), undefined, value),
    },
  ]
  const intakeCounts = intakeViewCounts(intakes, p => intakeGuidance(state, p, actor))
  const intakesList = runList(`${actor.role}:confirmations`, intakes.filter(p => intakeView === "all" || intakeGuidance(state, p, actor)?.kind === intakeView), {
    searchText: projectText,
    filters: [
      {
        id: "status",
        label: "Status",
        allLabel: "All statuses",
        options: [
          { value: "pending", label: "Awaiting confirmation" },
          { value: "changes_requested", label: "Changes requested" },
          { value: "draft", label: "Drafts" },
        ],
        test: (p, value) => p.status === value,
      },
      { ...typeFilterP(intakes), options: PROJECT_TYPES.map(value => ({ value, label: value })) },
    ],
  })
  const assignmentQuery = getListQuery(`${actor.role}:assignments`)
  useEffect(() => {
    for (const section of ["current", "upcoming", "previous"]) {
      const key = `${actor.role}:assignments-${section}`
      if (getListQuery(key).page !== 1) updateListQuery(key, q => withPage(q, 1))
    }
  }, [actor.role, assignmentQuery, assignmentFilter, assignmentSort, assignmentIntakeView])
  const activityFeed = runList(`${actor.role}:activity`, events, {
    searchText: (e) => `${e.title} ${e.detail}`,
    filters: [
      {
        id: "type",
        label: "Event type",
        allLabel: "All activity",
        options: ["request", "approval", "progress", "notice", "account"].map(
          (value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }),
        ),
        test: (e, value) => e.type === value,
      },
      ...dateFilters<WorkspaceEvent>((e) => e.date, "Date"),
    ],
  })
  async function act(command: WorkflowCommand, success?: string) {
    const result = await onCommand(command)
    if (!result.ok) {
      setError(result.error || "This action is not available.")
      return false
    }
    setError("")
    setMessage(result.message || success || "Workspace updated.")
    return true
  }
  function navigate(next: string) {
    setPage(normalizeWorkspacePage(next))
    setConfirmTab("mine")
    setQuery("")
    setError("")
    setMobileNav(false)
    setBell(false)
  }
  // Old SPM responses links open the Site PM responses tab of Confirmation queue.
  function openSiteResponses() {
    navigate("Confirmation queue")
    setConfirmTab("responses")
  }
  function openDocuments(p: Project) {
    setPickedId(p.id)
    navigate("Documents")
  }
  function openChecklistApprovals(project?: Project) {
    const filters: Record<string, string> = project ? { project: project.id } : {}
    updateListQuery(`${actor.role}:review-qa`, current => ({
      ...current, search: "", filters, page: 1,
    }))
    navigate("Rework & approvals")
    setTab("qa")
  }
  async function showDoc(p: Project, doc: Doc) {
    if (isOpm ? p.opmId !== actor.id : !isAssigned(p, actor.id)) {
      setError("Document access is outside your project scope.")
      return
    }
    if (!isOpm && DOC_LABELS.slice(0, 6).includes(doc.label)) {
      setError(
        "Office PM registered documents are not available in the Site PM repository.",
      )
      return
    }
    if (
      await act(
        { type: "view_document", projectId: p.id, doc },
        "Watermarked document preview opened.",
      )
    )
      setPreview(doc)
  }
  function header(title: string, action?: ReactNode) {
    return (
      <>
        <div className="page-heading">
          <div>
            <div className="eyebrow">
              {isOpm ? "OFFICE PROJECT MANAGEMENT" : "SITE OPERATIONS"}
            </div>
            <h1>
              {title}
              <span className="heading-dot">.</span>
            </h1>
          </div>
          {action}
        </div>
        <LicenseBanner license={state.license?.self} />
        {["Dashboard", "Assignments", "Confirmation queue"].includes(page) && (
          <ReassignRequests
            requests={state.license?.requests || []}
            onError={setError}
            onChanged={() => {
              setError("")
              setMessage("Reassignment answered.")
              void onReload()
            }}
          />
        )}
      </>
    )
  }
  function timeline(p: Project) {
    const step = !p.opmAccepted
      ? 0
      : !registeredComplete(p)
        ? 1
        : !leadConfirmed(p)
          ? 2
          : !teamConfirmed(p)
            ? 3
            : 4
    return (
      <ol className="role-intake-timeline">
        {[
          "Office PM accepts",
          "Six documents",
          "Lead Site PM",
          "Remaining Site PMs",
          "Subcontractor allocation",
        ].map((label, i) => (
          <li
            key={label}
            className={i < step ? "done" : i === step ? "current" : ""}
          >
            <span>{i < step ? <Icon name="check" size={15} /> : i + 1}</span>
            <strong>{label}</strong>
          </li>
        ))}
      </ol>
    )
  }
  function assignmentRoster(p: Project, allowReassign = false) {
    return (
      <div className="role-roster">
        {p.team.map((t) => (
          <div key={t.phase}>
            <div>
              <strong>{t.phase}</strong>
              <small>
                {t.phase === "Mobilization"
                  ? `Project-specific Lead Site PM · ${projectPhaseDisciplines(p, t.phase).join(", ")}`
                  : projectPhaseDisciplines(p, t.phase).join(", ") ||
                    "Phase responsibility"}
              </small>
            </div>
            <span>{t.accountId ? actorName(t.accountId) : "Unassigned"}</span>
            <Status value={t.accountId ? t.status : "unassigned"} />
            {allowReassign &&
              t.status !== "confirmed" &&
              p.status !== "completed" && (
                <select
                  aria-label={`Reassign ${p.name} ${t.phase}`}
                  value=""
                  onChange={async (e) =>
                    await act(
                      {
                        type: "reassign_phase",
                        projectId: p.id,
                        phase: t.phase,
                        accountId: e.target.value,
                      },
                      "Phase reassigned; acceptance is required.",
                    )
                  }
                >
                  <option value="">Reassign phase…</option>
                  {spmCandidates(state, p.type, t.phase, p.id).map((c) => (
                    <option key={c.account.id} value={c.account.id}>
                      {c.account.name} · {c.matched}/{c.total} tags
                    </option>
                  ))}
                </select>
              )}
          </div>
        ))}
      </div>
    )
  }
  function confirmationCard(p: Project) {
    const work = workflowFor(p)
    const guidance = intakeGuidance(state, p, actor)
    return (
      <Panel
        key={p.id}
        className={guidance?.kind === "action" ? "action-required" : ""}
        title={p.name}
        subtitle={`${p.type} · ${p.area} sqm · ${p.floors} floors`}
        actions={
          <div className="button-group">
            {guidance?.kind === "action" && (
              <Badge tone="amber">Action Required</Badge>
            )}
            <Status
              value={
                p.status === "draft"
                  ? "draft"
                  : p.status === "changes_requested"
                  ? "changes requested"
                  : p.opmAccepted
                    ? "Office PM accepted"
                    : "awaiting Office PM"
              }
            />
          </div>
        }
      >
        <div className="role-card-content">
          <IntakeGuidance state={state} project={p} actor={actor} />
          {timeline(p)}
          <div className="role-project-facts">
            <span>
              <Icon name="users" size={17} />
              Lead: {actorName(leadId(p))}
            </span>
            <span>
              <Icon name="calendar" size={17} />
              Target: {dateLabel(p.start)} –{" "}
              {p.end ? dateLabel(p.end) : "end not set"}
            </span>
            <span>
              <Icon name="doc" size={17} />
              {registeredCount(p)}/6 documents
            </span>
          </div>
          {p.status === "changes_requested" || p.status === "draft" ? (
            <div className="notice">
              <Icon name="clock" />
              <p>
                {p.status === "draft" ? "Administrator must complete and submit this draft before Office PM acceptance." : `${p.note} Administrator resubmission is required; the same Office PM is excluded from this intake.`}
              </p>
            </div>
          ) : !p.opmAccepted ? (
            <div className="role-actions">
              <Button
                variant="primary"
                icon="check"
                disabled={guidance?.action !== "confirm"}
                onClick={async () => {
                  if (
                    await act(
                      { type: "accept_opm", projectId: p.id },
                      "Office PM assignment accepted.",
                    )
                  ) {
                    setPickedId(p.id)
                    setAcceptedId(p.id)
                  }
                }}
              >
                Accept Office PM assignment
              </Button>
              <Button
                disabled={guidance?.action !== "confirm"}
                onClick={() => {
                  setDeclineReason("")
                  setDialog({ kind: "changes", projectId: p.id })
                }}
              >
                Request changes
              </Button>
              <Button
                variant="text-button"
                onClick={() => setDialog({ kind: "project", projectId: p.id })}
              >
                View assignment details
                <Icon name="arrow" size={16} />
              </Button>
            </div>
          ) : (
            <>
              <div className="role-actions">
                <Button
                  variant="primary"
                  icon={registeredComplete(p) ? "folder" : "upload"}
                  onClick={() => openDocuments(p)}
                >
                  {registeredComplete(p)
                    ? "View project documents"
                    : "Open required documents"}
                </Button>
                <Button onClick={openSiteResponses}>
                  {guidance?.action === "reassign" ? "Review phase assignments" : "Track Site PM responses"}
                </Button>
              </div>
            </>
          )}
          {work.deadline && (
            <div className="deadline-inline">
              <Icon name="clock" size={17} />
              <span>
                {actorName(work.deadline.accountId)} · Hard response deadline{" "}
                {new Date(work.deadline.hard).toLocaleString()}
              </span>
            </div>
          )}
          <details className="role-details">
            <summary>View Site PM team by phase</summary>
            {assignmentRoster(p, true)}
          </details>
          {p.opmAccepted && p.opmId === actor.id && (
            <details className="role-details">
              <summary>View subcontractor allocation (read-only)</summary>
              <SubcontractorAllocationReadOnly state={state} project={p} />
            </details>
          )}
        </div>
      </Panel>
    )
  }
  function dashboard() {
    // Dashboard widgets show 5 rows per page with a compact pager; "View all" opens the full module.
    const dashActivity = runList(`${actor.role}:dash-activity`, events, { searchText: () => "" }, { pageSize: 5 })
    return (
      <>
        {header(
          isOpm ? "Project overview" : "Site overview",
        )}
        {isOpm && <ChecklistApprovalBanner projects={allActive} actor={actor} onReview={openChecklistApprovals} />}
        <div className="metrics-grid">
          {[
            {
              title: isOpm ? "Managed active sites" : "Current active sites",
              value: active.length,
              detail: "Assigned to you",
              icon: "building",
              target: "Active sites",
            },
            {
              title: "Actionable assignments",
              value: tasks.length,
              detail: isOpm
                ? "Awaiting your confirmation"
                : "Awaiting your response",
              icon: "check",
              target: isOpm ? "Confirmation queue" : "Assignments",
            },
            {
              title: isOpm ? "Pending reviews" : "Rework flags submitted",
              value: isOpm
                ? pendingUpdates.length + pendingRework.length + qaCount
                : projects.filter(
                    (p) => workflowFor(p).pendingRework?.authorId === actor.id,
                  ).length,
              detail: isOpm
                ? "Progress, QA/QC and rework"
                : "Pending Office PM review",
              icon: "shield",
              target: isOpm ? "Rework & approvals" : "Active sites",
            },
            {
              title: "Open intake projects",
              value: intakes.length,
              detail: "In pre-construction setup",
              icon: "folder",
              target: isOpm ? "Documents" : "Assignments",
            },
          ].map((metric) => (
            <button
              className="metric-card"
              key={metric.title}
              onClick={() => navigate(metric.target)}
            >
              <div className="metric-top">
                <span>{metric.title}</span>
                <span className="metric-icon">
                  <Icon name={metric.icon} />
                </span>
              </div>
              <div className="metric-value">
                {String(metric.value).padStart(2, "0")}
              </div>
              <div className="metric-bottom">
                <span>{metric.detail}</span>
                <Icon name="arrow" size={16} />
              </div>
            </button>
          ))}
        </div>
        <div className="summary-pills">
          <span>
            <b>{projects.length}</b>Projects handled
          </span>
          <span>
            <b>{projects.filter((p) => p.status === "completed").length}</b>
            Completed project records
          </span>
          {!isOpm && (
            <span>
              <b>
                {projects.reduce(
                  (n, p) =>
                    n + p.team.filter((t) => t.accountId === actor.id).length,
                  0,
                )}
              </b>
              Phases assigned to you
            </span>
          )}
        </div>
        {picked && (
          <Panel
            title="Your next step"
            subtitle={picked.name}
            actions={
              <Button
                variant="text-button"
                onClick={() =>
                  navigate(isOpm ? "Confirmation queue" : "Assignments")
                }
              >
                Open assignment
                <Icon name="arrow" size={16} />
              </Button>
            }
          >
            <div className="role-card-content">
              {timeline(picked)}
              <div className="next-step-callout">
                <span className="file-icon">
                  <Icon
                    name={
                      !picked.opmAccepted
                        ? "check"
                        : !registeredComplete(picked)
                          ? "upload"
                          : "users"
                    }
                  />
                </span>
                <div>
                  <h3>
                    {!picked.opmAccepted
                      ? "Office PM acceptance is required"
                      : !registeredComplete(picked)
                        ? `${registeredCount(picked)} of 6 required documents uploaded`
                        : !leadConfirmed(picked)
                          ? "Ready for Lead Site PM acceptance"
                          : !teamConfirmed(picked)
                            ? "Waiting for remaining Site PM responses"
                            : "Lead Site PM subcontractor coordination is unlocked"}
                  </h3>
                  <p>
                    {isOpm
                      ? !picked.opmAccepted
                        ? "Review and accept your assignment to unlock document upload."
                        : !registeredComplete(picked)
                          ? "You can leave and resume document upload without losing confirmed files."
                          : "Every Site PM must accept their assigned responsibility before allocation."
                      : assignmentBlock(picked, actor.id) ||
                        (allocationReady(picked) && actor.id === leadId(picked)
                          ? "Contact selected companies, record their actual responses, then upload the signed agreement."
                          : "Your assigned responsibility is ready for review.")}
                  </p>
                </div>
                {isOpm && picked.opmAccepted && !registeredComplete(picked) && (
                  <Button
                    variant="primary"
                    onClick={() => openDocuments(picked)}
                  >
                    Resume Document Upload
                  </Button>
                )}
                {!isOpm && (
                  <Button
                    variant="primary"
                    onClick={() => navigate("Assignments")}
                  >
                    Review assignment
                  </Button>
                )}
              </div>
            </div>
          </Panel>
        )}
        <div className="role-two-column">
          <Panel
            title="Upcoming deadlines"
            actions={
              <Button
                variant="text-button"
                onClick={() => navigate("Deadlines")}
              >
                View deadlines
              </Button>
            }
          >
            {deadlineList(true)}
          </Panel>
          <Panel
            title="Recent activity"
            actions={
              <Button
                variant="text-button"
                onClick={() => navigate("Activity log")}
              >
                View all
              </Button>
            }
          >
            {activityList(dashActivity.view.items)}
            <CompactPager list={dashActivity} />
          </Panel>
        </div>
        <WorkRecord userId={actor.id} />
      </>
    )
  }
  // Existing Office PM upload UI and rules, now shown inside a project's view.
  function requiredDocuments(p: Project) {
    const contract = p.docs.find(
      (d) => d.label === "Client Contract Agreement" && d.uploaded,
    )
    const panel = (
      <Panel
        title="Required documents"
        subtitle={`${registeredCount(p)} / 6 required Office PM documents uploaded`}
        actions={
          <Badge tone={registeredComplete(p) ? "green" : "amber"}>
            {registeredComplete(p) ? "Documents complete" : "In progress"}
          </Badge>
        }
      >
        <div className="role-card-content">
          <IntakeGuidance state={state} project={p} actor={actor} />
          <div className="document-completion">
            <progress max={6} value={registeredCount(p)} />
            <strong>{registeredCount(p)} / 6</strong>
          </div>
          {!p.opmAccepted && (
            <div className="notice">
              <Icon name="shield" />
              <p>
                Accept your Office PM assignment before uploading any required
                project document.
              </p>
              <Button onClick={() => navigate("Confirmation queue")}>
                Review assignment
              </Button>
            </div>
          )}
          <h3>Admin-uploaded Client Contract Agreement</h3>
          {p.opmAccepted && contract ? (
            <DocumentList
              docs={[contract]}
              onPreview={(doc) => showDoc(p, doc)}
            />
          ) : (
            <p className="role-muted subsection">
              {" "}
              {p.opmAccepted
                ? "No original Admin contract file is attached to this intake record. Newly created intake projects include their uploaded agreement."
                : "View and download become available after you accept."}
            </p>
          )}
          {p.opmAccepted && (
            <div className="registered-documents">
              {DOC_LABELS.slice(0, 6).map((label, i) => {
                const doc = p.docs.find((d) => d.label === label)
                return (
                  <section
                    className={`registered-document ${
                      doc?.uploaded ? "complete" : ""
                    }`}
                    key={label}
                  >
                    <span className="document-number">
                      {doc?.uploaded ? (
                        <Icon name="check" size={20} />
                      ) : (
                        String(i + 1).padStart(2, "0")
                      )}
                    </span>
                    <div>
                      <h3>{label}</h3>
                      <p>
                        {doc?.uploaded
                          ? `${doc.name} · confirmed ${dateLabel(doc.date)}`
                          : "Required · PDF, JPG, JPEG or PNG · Up to 10 MB"}
                      </p>
                    </div>
                    {doc?.uploaded ? (
                      <div className="button-group">
                        <Badge tone="green">Uploaded & locked</Badge>
                        <Button
                          variant="icon-button"
                          icon="search"
                          aria-label={`Preview ${label}`}
                          onClick={() => showDoc(p, doc)}
                        />
                        <Button
                          variant="icon-button"
                          icon="download"
                          aria-label={`Download ${label}`}
                          onClick={() => downloadDoc(doc)}
                        />
                      </div>
                    ) : (
                      <Upload
                        label={label}
                        owner={actor.name}
                        disabled={!p.opmAccepted || p.status !== "pending"}
                        buttonLabel={`Upload ${label}`}
                        onSave={async (d) =>
                          await act(
                            {
                              type: "upload_registered",
                              projectId: p.id,
                              docIndex: i,
                              doc: d,
                            },
                            `${label} uploaded.`,
                          )
                        }
                      />
                    )}
                  </section>
                )
              })}
            </div>
          )}
          {registeredComplete(p) && (
            <div className="notice">
              <Icon name="check" />
              <p>
                All six documents are confirmed. {actorName(leadId(p))} must
                accept first, then the remaining Site PMs. Uploading documents
                does not activate the project.
              </p>
            </div>
          )}
          <div className="role-document-row">
            <Icon name="shield" />
            <div>
              <h3>{DOC_LABELS[6]}</h3>
              <p>
                Owned by the Lead Site PM. You cannot upload it on their behalf.
              </p>
            </div>
            <Status
              value={
                p.docs.some((d) => d.label === DOC_LABELS[6] && d.uploaded)
                  ? "uploaded"
                  : "awaiting Lead Site PM"
              }
            />
          </div>
        </div>
      </Panel>
    )
    return registeredComplete(p) ? (
      <details className="role-details">
        <summary>6/6 required documents complete</summary>
        {panel}
      </details>
    ) : (
      panel
    )
  }
  // Review statuses already stored in the workflow: checklist item status, or
  // a submission that is waiting in the pending update / rework slot.
  function reviewStatusFor(p: Project, docId: string) {
    const work = workflowFor(p)
    for (const items of Object.values(work.checklist)) {
      const item = items.find((entry) => entry.doc?.id === docId)
      if (item) return item.status
    }
    if (
      submissionDocs(work.pendingUpdate).some((d) => d.id === docId) ||
      work.pendingRework?.evidence?.id === docId
    )
      return "pending"
    return undefined
  }
  function repositoryProject(p: Project) {
    return {
      id: p.id,
      name: p.name,
      subtitle: `${p.type} · ${p.phase}`,
      type: p.type,
      phase: p.phase,
      status: p.status,
      categories: staffRepositoryCategories(
        projectDocumentIndexFor(p, actor),
        isOpm ? (doc) => reviewStatusFor(p, doc.id) : undefined,
        isOpm,
      ),
    }
  }
  function openIndexedDoc(p: Project | undefined, fileId: string) {
    const doc = p && findIndexedDoc(projectDocumentIndexFor(p, actor), fileId)
    if (p && doc) showDoc(p, doc)
  }
  function repositoryBrowser(scoped: Project[]) {
    return (
      <DocumentRepository
        listKey={`${actor.role}:documents`}
        recentKey={actor.id}
        className="role-document-browser"
        {...(!isOpm && {
          rootLabel: "Document repository",
          rootClickable: true,
          projectSubtitle: (id: string) => {
            const p = scoped.find((item) => item.id === id)
            return p
              ? `${p.type} · ${p.phase} · ${p.progress}% recorded progress`
              : ""
          },
          projectIntro: (id: string) => (
            <div className="role-card-content">
              <div className="notice">
                <Icon name="shield" />
                <p>
                  Site PM access is view-only for the submitted subcontractor
                  agreement. Office PM permits, budgets and registered contracts
                  are not exposed here.
                </p>
              </div>
            </div>
          ),
        })}
        {...(isOpm && {
          rootLabel: "Documents",
          rootClickable: true,
          fileDetails: true,
          renderStatus: (value: string) => <Status value={value} />,
          projectSubtitle: (id: string) => {
            const p = scoped.find((item) => item.id === id)
            return p ? `${p.type} · ${p.phase}` : ""
          },
          projectStatus: (id: string) => {
            const p = scoped.find((item) => item.id === id)
            if (!p) return { label: "", tone: "neutral" as const }
            const stage = officePmStage(p)
            if (
              stage.kind === "action" &&
              (stage.reason === "confirm" || stage.reason === "documents")
            )
              return {
                label: `${registeredCount(p)}/6 required documents uploaded`,
                tone: "action" as const,
              }
            if (!p.opmAccepted)
              return {
                label:
                  p.status === "changes_requested"
                    ? "Waiting for Administrator resubmission"
                    : "Accept assignment first",
                tone: "neutral" as const,
              }
            return registeredComplete(p)
              ? {
                  label: "Required documents complete",
                  tone: "success" as const,
                }
              : {
                  label: `${registeredCount(p)}/6 required uploaded`,
                  tone: "neutral" as const,
                }
          },
          projectIntro: (id: string) => {
            const p = scoped.find((item) => item.id === id)
            return p ? requiredDocuments(p) : null
          },
          onDownload: (projectId: string, fileId: string) => {
            const p = scoped.find((item) => item.id === projectId)
            const doc =
              p && findIndexedDoc(projectDocumentIndexFor(p, actor), fileId)
            if (doc) void downloadDoc(doc)
          },
        })}
        projects={scoped.map(repositoryProject)}
        onOpen={(projectId, fileId) =>
          openIndexedDoc(
            scoped.find((item) => item.id === projectId),
            fileId,
          )
        }
      />
    )
  }
  function documentWorkspace() {
    if (!picked)
      return (
        <Empty title="No projects available.">
          An Administrator must assign you to a project first.
        </Empty>
      )
    if (!isOpm)
      return (
        <>
          {header(
            "Document repository",
          )}
          {repositoryBrowser(projects)}
        </>
      )
    return (
      <>
        {header(
          "Project documents",
        )}
        {repositoryBrowser(projects.filter((p) => p.opmId === actor.id))}
      </>
    )
  }
  function assignmentDetail(p: Project) {
    const ownRows = p.team.filter((t) => t.accountId === actor.id)
    const pending = ownRows.filter((t) => t.status === "pending")
    const block = assignmentBlock(p, actor.id)
    const work = workflowFor(p)
    return (
      <Panel
        key={p.id}
        title={p.name}
        subtitle={`${p.type} · ${
          actor.id === leadId(p)
            ? "You are the project Lead Site PM"
            : "You are assigned to later construction phases"
        }`}
        actions={
          <Status
            value={
              pending.length
                ? block
                  ? "Prerequisites pending"
                  : "action needed"
                : "confirmed"
            }
          />
        }
      >
        <div className="role-card-content">
          <IntakeGuidance state={state} project={p} actor={actor} />
          {timeline(p)}
          {pending.length > 0 && (
            <>
              {isIntake(p)
                ? block ? <div className="notice"><Icon name="shield" /><p>{block}</p></div>
                  : pending.length > 1 && <p>One acceptance confirms all {pending.length} pending phases assigned to you.</p>
                : <div className="notice"><Icon name={block ? "shield" : "check"} /><p>{block || `Your ${pending.length} pending phase responsibilit${pending.length === 1 ? "y is" : "ies are"} ready. One acceptance confirms all phases assigned to you on this project.`}</p></div>}
              <div className="role-actions">
                <Button
                  variant="primary"
                  icon="check"
                  disabled={!!block}
                  title={block}
                  onClick={async () =>
                    await act(
                      { type: "accept_assignment", projectId: p.id },
                      actor.id === leadId(p)
                        ? "Lead Site PM accepted. Remaining Site PMs may now respond."
                        : "All your pending phase assignments are confirmed.",
                    )
                  }
                >
                  {actor.id === leadId(p)
                    ? "Accept Lead Site PM assignment"
                    : "Accept my phase assignments"}
                </Button>
                <Button
                  disabled={!!block}
                  onClick={() => {
                    setDeclineReason("")
                    setDialog({
                      kind: "decline",
                      projectId: p.id,
                      phase: pending[0].phase,
                    })
                  }}
                >
                  Decline {pending[0].phase} phase
                </Button>
              </div>
            </>
          )}
          {work.deadline &&
            work.deadline.accountId === actor.id &&
            pending.length > 0 && (
              <div
                className={`deadline-card ${
                  Date.now() > Date.parse(work.deadline.soft) ? "urgent" : ""
                }`}
              >
                <Icon name="clock" />
                <div>
                  <strong>
                    Respond by {new Date(work.deadline.soft).toLocaleString()}
                  </strong>
                  <p>
                    One-business-day target. Hard deadline:{" "}
                    {new Date(work.deadline.hard).toLocaleString()}. Unanswered
                    requests expire and are escalated.
                  </p>
                </div>
              </div>
            )}
          {allocationReady(p) ? (
            <details className="role-details">
              <summary>
                View confirmed Site PM team ({p.team.length} phases)
              </summary>
              {assignmentRoster(p)}
            </details>
          ) : (
            assignmentRoster(p)
          )}
          {p.status === "completed" ? (
            <div className="notice subsection">
              <Icon name="shield" />
              <p>
                This project is complete. Its assignment record is read-only.
              </p>
            </div>
          ) : allocationReady(p) && actor.id === leadId(p) ? (
            subcontractorAllocation(p)
          ) : allocationReady(p) ? (
            <div className="notice subsection">
              <Icon name="shield" />
              <p>
                All Site PMs accepted. Only {actorName(leadId(p))}, the project
                Lead, can select and contact subcontractors or submit the signed
                agreement.
              </p>
            </div>
          ) : (
            <div className="allocation-locked">
              <Icon name="shield" />
              <div>
                <h3>Subcontractor allocation is locked</h3>
                <p>
                  Office PM acceptance, all six required documents, and every
                  assigned Site PM acceptance are required. {registeredCount(p)}
                  /6 documents ·{" "}
                  {p.team.filter((t) => t.status === "confirmed").length}/
                  {p.team.length} phase confirmations.
                </p>
              </div>
            </div>
          )}
        </div>
      </Panel>
    )
  }
  function assignmentInfo(p: Project) {
    const work = workflowFor(p)
    const own = p.team.filter((t) => t.accountId === actor.id)
    const pending = own.filter((t) => t.status === "pending")
    const lead = actor.id === leadId(p)
    const group =
      p.status === "active"
        ? "current"
        : p.status === "completed" ||
            p.status === "declined" ||
            p.status === "expired"
          ? "previous"
          : "upcoming"
    const doneDate =
      work.completedAt?.slice(0, 10) ||
      p.history[p.history.length - 1]?.date ||
      p.created
    const deadline =
      work.deadline && work.deadline.accountId === actor.id && pending.length
        ? work.deadline
        : undefined
    const block = pending.length ? assignmentBlock(p, actor.id) : ""
    const actions: string[] = []
    if (pending.length)
      actions.push(
        block
          ? block
          : `Accept ${pending.length} phase${
              pending.length === 1 ? "" : "s"
            } assigned to you`,
      )
    if (group === "current" && phaseOwner(p) === actor.id)
      actions.push(`Your phase is active: ${p.phase}`)
    if (group === "upcoming" && lead && !pending.length && allocationReady(p))
      actions.push("Coordinate subcontractor and signed agreement")
    return {
      group,
      lead,
      own,
      pending,
      deadline,
      actions,
      assigned: p.created,
      doneDate,
      sortDate: group === "previous" ? doneDate : p.created,
    }
  }
  function assignmentCard(p: Project, info: ReturnType<typeof assignmentInfo>) {
    const guidance = intakeGuidance(state, p, actor)
    const blocker = guidance && info.pending.length ? assignmentBlock(p, actor.id) : ""
    const actionNotes = guidance ? (blocker ? [blocker] : []) : info.actions
    const statusLabel =
      info.group === "current"
        ? "Current Project"
        : info.group === "upcoming"
          ? guidance?.kind === "action"
            ? "Action needed"
            : guidance ? "Waiting / prerequisites" : "Upcoming"
          : p.status === "completed"
            ? "Completed"
            : p.status === "declined"
              ? "Declined"
              : "Expired"
    return (
      <article
        key={p.id}
        className={`assignment-card ${info.group}`}
        aria-label={p.name}
      >
        <div className="assignment-card-top">
          <div>
            <h3>{p.name}</h3>
            <p className="assignment-location">
              <Icon name="building" size={16} />
              {p.location || "Location not set"} · {p.type}
            </p>
          </div>
          <Badge
            tone={
              info.group === "current"
                ? "green"
                : guidance?.kind === "action"
                  ? "amber"
                  : ""
            }
          >
            {statusLabel}
          </Badge>
        </div>
        <dl className="assignment-facts">
          <div>
            <dt>Assigned</dt>
            <dd>{dateLabel(info.assigned)}</dd>
          </div>
          <div>
            <dt>Project start</dt>
            <dd>{dateLabel(p.start)}</dd>
          </div>
          <div>
            <dt>Target end</dt>
            <dd>{p.end ? dateLabel(p.end) : "Not set"}</dd>
          </div>
          {info.group === "previous" && (
            <div>
              <dt>{p.status === "completed" ? "Completed" : "Closed"}</dt>
              <dd>{dateLabel(info.doneDate)}</dd>
            </div>
          )}
          <div>
            <dt>Role</dt>
            <dd>
              {info.lead ? "Lead Site PM" : "Site PM"} ·{" "}
              {info.own.map((t) => t.phase).join(", ") || "—"}
            </dd>
          </div>
          <div>
            <dt>Project phase</dt>
            <dd>{p.status === "pending" ? "Not started" : p.phase}</dd>
          </div>
        </dl>
        <IntakeGuidance state={state} project={p} actor={actor} />
        {p.status !== "pending" && (
          <div className="assignment-progress">
            <div
              className="progress-track"
              role="progressbar"
              aria-valuenow={p.progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${p.name} progress`}
            >
              <span style={{ width: `${p.progress}%` }} />
            </div>
            <strong>{p.progress}%</strong>
          </div>
        )}
        {(actionNotes.length > 0 || info.deadline) && (
          <ul className="assignment-actions-list">
            {actionNotes.map((text) => (
              <li key={text}>
                <Icon name="clock" size={16} />
                {text}
              </li>
            ))}
            {info.deadline && (
              <li
                className={
                  Date.now() > Date.parse(info.deadline.soft) ? "urgent" : ""
                }
              >
                <Icon name="alert" size={16} />
                Respond by {new Date(info.deadline.soft).toLocaleString()} ·
                hard deadline {new Date(info.deadline.hard).toLocaleString()}
              </li>
            )}
          </ul>
        )}
        <div className="assignment-card-footer">
          <Button
            variant={guidance?.kind === "action" ? "primary" : ""}
            icon="chevron"
            onClick={() => {
              setAssignmentId(p.id)
              window.scrollTo({ top: 0 })
            }}
            aria-label={`View assignment for ${p.name}`}
          >
            {guidance?.kind === "action" ? guidance.label : "View Assignment"}
          </Button>
        </div>
      </article>
    )
  }
  function assignmentPage() {
    const selected = projects.find((p) => p.id === assignmentId)
    if (selected)
      return (
        <>
          {header(
            "Assignment details",
            <Button icon="chevron" onClick={() => setAssignmentId("")}>
              Back to assignments
            </Button>,
          )}
          {assignmentDetail(selected)}
        </>
      )
    const rows = projects.map((p) => ({ p, info: assignmentInfo(p) }))
    const time = (d: string) => Date.parse(d) || 0
    const order = (
      group: string,
      a: typeof rows[number],
      b: typeof rows[number],
    ) => {
      if (assignmentSort === "oldest")
        return time(a.info.sortDate) - time(b.info.sortDate)
      if (assignmentSort === "newest")
        return time(b.info.sortDate) - time(a.info.sortDate)
      if (assignmentSort === "start") return time(a.p.start) - time(b.p.start)
      if (group === "upcoming") return time(a.p.start) - time(b.p.start)
      return time(b.info.sortDate) - time(a.info.sortDate)
    }
    const counts = intakeViewCounts(projects, p => intakeGuidance(state, p, actor))
    const visible = rows.filter(({ p }) => assignmentIntakeView === "all" || intakeGuidance(state, p, actor)?.kind === assignmentIntakeView).filter(({ p, info }) =>
      assignmentFilter === "all"
        ? true
        : assignmentFilter === "action"
          ? isIntake(p) ? intakeGuidance(state, p, actor)?.kind === "action" : info.pending.length > 0
          : assignmentFilter === "completed"
            ? p.status === "completed"
            : assignmentFilter === "closed"
              ? p.status === "declined" || p.status === "expired"
              : info.group === assignmentFilter,
    )
    const assignmentList = runList(`${actor.role}:assignments`, visible, {
      searchText: ({ p }) => `${p.name} ${p.type} ${p.phase}`,
      filters: [
        {
          id: "type",
          label: "Project type",
          allLabel: "All types",
          options: PROJECT_TYPES.map(value => ({ value, label: value })),
          test: ({ p }, value) => p.type === value,
        },
        {
          id: "phase",
          label: "Phase",
          allLabel: "All phases",
          options: optionsFrom(rows.map(({ p }) => p.phase)),
          test: ({ p }, value) => p.phase === value,
        },
      ],
    })
    const sections = [
      {
        id: "current",
        title: "Current Projects",
        note: "Active sites, most recently assigned first.",
        empty: "No active project assignments.",
      },
      {
        id: "upcoming",
        title: "Upcoming Assignments",
        note: "Awaiting acceptance or activation, nearest start date first.",
        empty: "No upcoming assignments.",
      },
      {
        id: "previous",
        title: "Previous Projects",
        note: "Completed and closed, most recent first.",
        empty: "No previous projects yet.",
      },
    ]
    return (
      <>
        {header(
          "Assignments",
        )}
        <IntakeTabs value={assignmentIntakeView} counts={counts} allLabel="All assignments" onChange={setAssignmentIntakeView} />
        {assignmentIntakeView !== "all" && !visible.length && <Empty title={assignmentIntakeView === "action" ? "No available intake actions" : "No intake assignments waiting for others"}>Current and previous construction assignments remain under All assignments. Check any selected status filter.</Empty>}
        <div className="assignment-toolbar">
          <label>
            <span>Status</span>
            <select
              value={assignmentFilter}
              onChange={(e) => setAssignmentFilter(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="action">Action needed</option>
              <option value="current">Current</option>
              <option value="upcoming">Upcoming</option>
              <option value="completed">Completed</option>
              <option value="closed">Declined or expired</option>
            </select>
          </label>
          <label>
            <span>Sort by date</span>
            <select
              value={assignmentSort}
              onChange={(e) => setAssignmentSort(e.target.value)}
            >
              <option value="recommended">Recommended order</option>
              <option value="newest">Newest assignment first</option>
              <option value="oldest">Oldest assignment first</option>
              <option value="start">Project start date</option>
            </select>
          </label>
        </div>
        <ListToolbar
          list={assignmentList}
          placeholder="Search assignments"
          noun="assignment"
        />
        {assignmentList.narrowed && !assignmentList.matched.length && (
          <NoResults list={assignmentList} />
        )}
        {sections.map((section) => {
          const list = assignmentList.matched
            .filter(({ info }) => info.group === section.id)
            .sort((a, b) => order(section.id, a, b))
          const sectionPaging = runList(
            `${actor.role}:assignments-${section.id}`,
            list,
            { searchText: () => "" },
          )
          return (
            <section
              key={section.id}
              className={`assignment-section ${section.id}`}
              aria-labelledby={`assign-${section.id}`}
            >
              <div className="assignment-section-head">
                <h2 id={`assign-${section.id}`}>
                  {section.title}{" "}
                  <span className="count-pill">{list.length}</span>
                </h2>
                <p>{section.note}</p>
              </div>
              {list.length ? (
                <>
                  <div className="assignment-grid">
                    {sectionPaging.view.items.map(({ p, info }) =>
                      assignmentCard(p, info),
                    )}
                  </div>
                  <ListPager list={sectionPaging} touch={!isOpm} />
                </>
              ) : (
                <p className="assignment-empty">{section.empty}</p>
              )}
            </section>
          )
        })}
        {!projects.length && (
          <Empty title="No assignment requests">
            Your Administrator and Office PM must assign and confirm a project
            first.
          </Empty>
        )}
      </>
    )
  }
  function subcontractorAllocation(p: Project) {
    return (
      <LeadSubcontractorPanel
        state={state}
        project={p}
        actor={actor}
        onAction={act}
        onCrew={(companyId) =>
          setDialog({ kind: "company", projectId: p.id, companyId })
        }
        onNewCompany={() => setDialog({ kind: "new-company", projectId: p.id })}
        onPreview={(doc) => showDoc(p, doc)}
        onOpenActive={() => {
          setPickedId(p.id)
          navigate("Active sites")
        }}
        onActivated={() => {
          setPickedId(p.id)
          if (p.status === "active") navigate("Active sites")
          else setDialog({ kind: "activated", projectId: p.id })
        }}
      />
    )
  }
  function progressForm(p: Project) {
    const work = workflowFor(p)
    const currentOwner =
      phaseOwner(p) === actor.id &&
      p.team.find((t) => t.phase === p.phase)?.status === "confirmed"
    if (!currentOwner) {
      const past = p.team.filter(
        (t) =>
          t.accountId === actor.id &&
          projectPhaseNames(p).indexOf(t.phase) <
            projectPhaseNames(p).indexOf(p.phase),
      )
      return (
        <div className="role-card-content">
          <div className="notice">
            <Icon name="shield" />
            <p>
              {past.length
                ? `Your completed phase responsibility (${past.map((t) => t.phase).join(", ")}) is now read-only. ${actorName(phaseOwner(p))} owns ${p.phase}.`
                : `${actorName(phaseOwner(p))} currently owns ${p.phase}. Your future phase is not yet active.`}
            </p>
          </div>
          {past.map((t) => (
            <details className="role-details" key={t.phase}>
              <summary>{t.phase} — completed phase record</summary>
              {checklistFor(p, t.phase).map((item) => (
                <div key={item.id} className="repository-check">
                  <span>{item.label}</span>
                  <Status value={item.status.replace(/_/g," ")} />
                </div>
              ))}
            </details>
          ))}
        </div>
      )
    }
    return (
      <div className="role-card-content">
        {work.handoff && (
          <div className="notice">
            <Icon name="check" />
            <p>
              Handoff complete: {work.handoff.from} → {work.handoff.to}. Your
              confirmed phase is now active.
            </p>
          </div>
        )}
        {work.updateRequested && (
          <div className="notice">
            <Icon name="bell" />
            <p>
              {actorName(work.updateRequested.by)} requested a site update on{" "}
              {dateLabel(work.updateRequested.date)}.
            </p>
          </div>
        )}
        <div className="site-progress-header">
          <div>
            <span className="eyebrow">CURRENT PHASE</span>
            <h3>{p.phase}</h3>
            <p>Assigned engineer: {actor.name}</p>
          </div>
          <div>
            <strong>{p.progress}%</strong>
            <p>System-calculated from approved checklists</p>
          </div>
        </div>
        {work.pendingRework ? (
          <div className="notice">
            <Icon name="shield" />
            <p>
              A site issue is awaiting Office PM review. Reporting an issue
              does not deduct progress. Rework requires a manual decision.
            </p>
          </div>
        ) : (
          <>
            {work.pendingUpdate && (
              <div className="notice">
                <Icon name="clock" />
                <p>
                  Your progress note is pending Office PM review. You can
                  continue submitting QA/QC evidence, but cannot submit another
                  normal note until it is resolved.
                </p>
              </div>
            )}
            <section className="role-checklist">
              <div className="section-title">
                <h3>Activity checklist — {p.phase}</h3>
                <Badge tone="green">
                  {
                    checklistFor(p).filter((i) => i.status === "approved")
                      .length
                  }
                  /{checklistFor(p).length} approved
                </Badge>
              </div>
              <p className="role-muted">
                Upload evidence one item at a time. Every required item needs
                Office PM QA/QC approval before the next phase can start.
              </p>
              {checklistFor(p).map((item) => (
                <div key={item.id} className="qa-checklist-row">
                  <div>
                    <h4>{item.label}</h4>
                    {checklistFeedback(item).rejection && (
                      <p className="error">
                        <strong>Rejected by Office PM:</strong> {checklistFeedback(item).rejection}
                      </p>
                    )}
                    {checklistFeedback(item).rework && <p className="error">Rework: {checklistFeedback(item).rework}</p>}
                    {checklistFeedback(item).submission && (
                      <p className="role-muted">Your submission note: {checklistFeedback(item).submission}</p>
                    )}
                    {item.doc && (
                      <button
                        className="inline-link"
                        onClick={() => showDoc(p, item.doc!)}
                      >
                        {item.doc.name}
                      </button>
                    )}
                    {item.escalated && (
                      <p className="role-muted">
                        Review escalated to Admin; still awaiting human
                        approval.
                      </p>
                    )}
                  </div>
                  <Status value={item.status.replace(/_/g," ")} />
                  {["missing","rework_required"].includes(item.status) && (
                    <Upload
                      label={item.label}
                      owner={actor.name}
                      buttonLabel={item.status==="rework_required"?"Upload corrected evidence":"Upload evidence"}
                      ariaLabel={`Upload evidence for ${item.label}`}
                      onSave={async (doc) =>
                        await act(
                          {
                            type: "submit_checklist",
                            projectId: p.id,
                            phase: p.phase,
                            itemId: item.id,
                            expectedVersion: item.version,
                            doc,
                          },
                          "Evidence submitted to Office PM for QA/QC.",
                        )
                      }
                    />
                  )}
                </div>
              ))}
              {workflowFor(p).checklist[p.phase]?.some(item => item.required === false) && <details className="role-details subsection">
                <summary>Previous checklist records</summary>
                <p className="role-muted">Retained for history. These records do not count toward the current required checklist.</p>
                {workflowFor(p).checklist[p.phase].filter(item => item.required === false).map(item => <div key={item.id} className="qa-checklist-row">
                  <div><h4>{item.label}</h4>{item.doc && <button className="inline-link" onClick={() => showDoc(p,item.doc!)}>{item.doc.name}</button>}</div>
                  <span>Historical record</span>
                </div>)}
              </details>}
            </section>
            <section className="role-progress-submit">
              <h3>Field update & issue reporting</h3>
              <div className="field-evidence">
                <div>
                  <strong>General photo / report</strong>
                  <p>
                    Optional supporting evidence · PDF, JPG or PNG · 10 MB
                    maximum
                  </p>
                  {evidence && (
                    <small>{evidence.name} · Confirmed locally</small>
                  )}
                </div>
                <Upload
                  label="General field evidence"
                  owner={actor.name}
                  onSave={setEvidence}
                />
              </div>
              <div className="issue-options">
                {ISSUES.map((issue) => (
                  <button
                    className={`chip ${
                      issueChoices.includes(issue) ? "selected" : ""
                    }`}
                    key={issue}
                    onClick={() =>
                      setIssueChoices((choices) =>
                        choices.includes(issue)
                          ? choices.filter((c) => c !== issue)
                          : [...choices, issue],
                      )
                    }
                  >
                    {issue}
                  </button>
                ))}
              </div>
              {issueChoices.length>0&&<fieldset className="subsection"><legend>Affected activities — {p.phase}</legend>
                {checklistFor(p).map(item=><label className="qa-checklist-row" key={item.id}>
                  <input type="checkbox" checked={affectedActivities.includes(item.id)} onChange={()=>setAffectedActivities(ids=>ids.includes(item.id)?ids.filter(id=>id!==item.id):[...ids,item.id])}/>
                  <span>{item.label}</span>
                </label>)}
                <p className="role-muted">Reporting an issue does not deduct progress. Office PM must review it first.</p>
              </fieldset>}
              <Field
                label={
                  issueChoices.length>0
                    ? "Explain the issue *"
                    : "Field notes (optional)"
                }
              >
                <textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Report the current conditions, observations, or a site issue."
                />
              </Field>
              <div className="role-actions">
                <Button
                  variant="primary"
                  disabled={(!!work.pendingUpdate && !issueChoices.length)||(issueChoices.length>0&&(!affectedActivities.length||!note.trim()))}
                  onClick={async () => {
                    if (
                      await act(
                        {
                          type: "submit_progress",
                          projectId: p.id,
                          note,
                          issues: issueChoices,
                          affectedActivityIds:affectedActivities,
                          evidence,
                        },
                        issueChoices.length
                          ? "Issue sent to Office PM for rework review."
                          : "Progress note submitted for review.",
                      )
                    ) {
                      setNote("")
                      setAffectedActivities([])
                      setIssueChoices([])
                      setEvidence(undefined)
                    }
                  }}
                >
                  {issueChoices.length
                    ? "Submit site issue"
                    : "Submit progress update"}
                </Button>
              </div>
            </section>
          </>
        )}
        <section className="detail-section">
          <h3>Site diary — internal notes</h3>
          <div className="role-note-entry">
            <Field label="New site diary note">
              <textarea
                value={diary}
                onChange={(e) => setDiary(e.target.value)}
                rows={2}
                placeholder="Add an internal operational note."
              />
            </Field>
            <Button
              onClick={async () => {
                if (
                  await act(
                    { type: "add_note", projectId: p.id, note: diary },
                    "Site diary updated.",
                  )
                )
                  setDiary("")
              }}
            >
              Add diary note
            </Button>
          </div>
          {work.notes
            .slice()
            .reverse()
            .map((n) => (
              <div className="history-row" key={n.id}>
                <Icon name="doc" size={17} />
                <div>
                  <strong>{n.text}</strong>
                  <p>
                    {actorName(n.authorId)} · {dateLabel(n.date)}
                  </p>
                </div>
              </div>
            ))}
        </section>
        <section className="detail-section">
          <div className="section-title">
            <h3>Site photo gallery</h3>
            <Upload
              label="Site photo (pending client release)"
              buttonLabel="Upload site photo"
              owner={actor.name}
              onSave={async (doc) =>
                await act(
                  { type: "add_photo", projectId: p.id, doc },
                  "Site photo saved internally. Office PM or Administrator release is required before the client can see it.",
                )
              }
            />
          </div>
          <div className="notice subsection">
            <Icon name="shield" />
            <p>
              Gallery photographs stay internal until the assigned Office PM or an
              Administrator reviews and releases them to the Client Portal.
              Field evidence and QA/QC uploads remain internal inspection records.
            </p>
          </div>
          <div className="site-photo-list">
            {work.photos.map((doc) => (
              <button key={doc.id} onClick={() => showDoc(p, doc)}>
                <Icon name="doc" />
                <span>
                  {doc.name}
                  <Badge tone={doc.clientVisible ? "green" : ""}>
                    {doc.clientVisible
                      ? "Client-visible gallery"
                      : "Internal · not released"}
                  </Badge>
                  <small>{dateLabel(doc.date)}</small>
                </span>
                <Icon name="search" size={17} />
              </button>
            ))}
          </div>
        </section>
      </div>
    )
  }
  function activeSites() {
    return (
      <>
        {header(
          "Active sites",
        )}
        <ActiveSites key={actor.id} phaseDefinitionsByType={state.backendPhases} reviewAvailable projects={allActive.map(p => ({
          ...p,
          lead: state.accounts.find(a => a.id === leadId(p))?.name,
          needsReview: hasPendingSiteReview(p),
        }))} onOpen={projectId => setDialog({ kind: "project", projectId })}
          renderActions={id => {
            const p = allActive.find(site => site.id === id)!
            return isOpm ? <>
              <Button icon="bell" onClick={async () => {
                await act({ type: "request_update", projectId: id }, "Site PM update reminder recorded.")
              }}>Request update</Button>
              {p.workflow?.pendingRework && <Button onClick={() => { navigate("Rework & approvals"); setTab("rework") }}>Review issue</Button>}
              {p.workflow?.pendingUpdate && <Button onClick={() => { navigate("Rework & approvals"); setTab("progress") }}>Review update</Button>}
            </> : active.some(site => site.id === id) ? <Button onClick={() => {
              setPickedId(id)
              requestAnimationFrame(() => document.getElementById("active-phase-workspace")?.scrollIntoView({ block: "start" }))
            }}>Open phase workspace</Button> : null
          }} />
        {!isOpm && picked && active.some(p => p.id === picked.id) && <div className="as-site-workspace" id="active-phase-workspace">
          <Panel title={`${picked.name} - Phase workspace`}>{progressForm(picked)}</Panel>
        </div>}
      </>
    )
  }
  function reviews() {
    const qaItems = allActive.filter((p) =>
      checklistFor(p).some((i) => i.status === "submitted"),
    )
    const qaList = runList(`${actor.role}:review-qa`, qaItems, {
      searchText: projectText,
      filters: [phaseFilterP(qaItems), {
        id: "project",
        label: "Project",
        allLabel: "All projects",
        options: qaItems.map(p => ({ value: p.id, label: p.name })),
        test: (p, value) => p.id === value,
      }],
    })
    const submissionItems = tab === "rework" ? pendingRework : pendingUpdates
    const submitter = (p: Project) => {
      const author = (
        tab === "rework" ? workflowFor(p).pendingRework : workflowFor(p).pendingUpdate
      )?.authorId
      return author ? actorName(author) : ""
    }
    const submissionList = runList(`${actor.role}:review-${tab}`, submissionItems, {
      searchText: (p) => `${projectText(p)} ${submitter(p)}`,
      filters: [
        phaseFilterP(submissionItems),
        {
          id: "by",
          label: "Submitted by",
          allLabel: "Anyone",
          options: optionsFrom(submissionItems.map(submitter)),
          test: (p, value) => submitter(p) === value,
        },
      ],
    })
    return (
      <>
        {header(
          "Rework & approvals",
        )}
        <div className="tabs standalone">
          {[
            ["progress", `Progress updates (${pendingUpdates.length})`],
            ["qa", `QA/QC evidence (${qaCount})`],
            ["rework", `Rework / issues (${pendingRework.length})`],
          ].map(([value, label]) => (
            <button
              key={value}
              className={tab === value ? "active" : ""}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "qa" ? (
          <>
            <ListSection
              list={qaList}
              placeholder="Search QA/QC reviews"
              noun="project"
              touch={!isOpm}
              empty={null}
              render={(items) => (
                <>
                  {items.map((p) => (
                <Panel
                  key={p.id}
                  title={p.name}
                  subtitle={`${p.phase} · Every required item needs human approval`}
                >
                  <div className="role-card-content">
                    {checklistFor(p)
                      .filter((i) => i.status === "submitted")
                      .map((item) => (
                        <div className="review-evidence-card" key={item.id}>
                          <div className="section-title">
                            <h3>{item.label}</h3>
                            <Status
                              value={
                                item.escalated
                                  ? "escalated — review required"
                                  : "submitted"
                              }
                            />
                          </div>
                          <p>
                            {item.submittedBy || item.submittedByName
                              ? `Evidence submitted by ${item.submittedByName || actorName(item.submittedBy || "")}`
                              : "Submitted"}{" "}
                            {item.submittedAt
                              ? new Date(item.submittedAt).toLocaleString()
                              : "date unavailable"}
                          </p>
                          {item.doc && (
                            <Button
                              icon="doc"
                              onClick={() => showDoc(p, item.doc!)}
                            >
                              View evidence · {item.doc.name}
                            </Button>
                          )}
                          <div className="role-actions">
                            <Button
                              variant="primary"
                              icon="check"
                              onClick={() => setEvidenceReview({
                                    type: "approve_checklist",
                                    projectId: p.id,
                                    phase: p.phase,
                                    itemId: item.id,
                                    evidenceId:item.evidenceId,
                                    expectedVersion: item.version,
                                  })}
                            >
                              Approve evidence
                            </Button>
                            <Button
                              variant="danger-ghost"
                              onClick={() => setEvidenceReview({
                                    type: "reject_checklist",
                                    projectId: p.id,
                                    phase: p.phase,
                                    itemId: item.id,
                                    evidenceId:item.evidenceId,
                                    expectedVersion: item.version,
                                  })}
                            >
                              Reject evidence
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                </Panel>
                  ))}
                </>
              )}
            />
            {qaCount === 0 && (
              <Empty title="No QA/QC evidence awaiting review" />
            )}
          </>
        ) : (
          <>
            <ListSection
              list={submissionList}
              placeholder="Search submissions"
              noun="project"
              touch={!isOpm}
              empty={null}
              render={(items) => (
                <>
                  {items.map((p) => {
              const submission =
                tab === "rework"
                  ? workflowFor(p).pendingRework!
                  : workflowFor(p).pendingUpdate!
              return (
                <Panel
                  key={p.id}
                  title={p.name}
                  subtitle={`${p.phase} · ${p.progress}% current recorded progress`}
                  actions={
                    <Status
                      value={
                        submission.escalated
                          ? "escalated — review required"
                          : "pending review"
                      }
                    />
                  }
                >
                  <div className="role-card-content">
                    <div className="submission-meta">
                      <span>Submitted by {actorName(submission.authorId)}</span>
                      <span>
                        {new Date(submission.submittedAt).toLocaleString()}
                      </span>
                    </div>
                    {submission.issues.length > 0 && (
                      <div className="tag-list subsection">
                        {submission.issues.map((issue) => (
                          <span key={issue}>{issue}</span>
                        ))}
                      </div>
                    )}
                    <p className="submission-note">
                      {submission.note || "No additional note provided."}
                    </p>
                    {submissionDocs(submission).length > 0 ? (
                      <div className="report-attachments">
                        <h4>
                          {tab === "rework" ? "Field evidence" : "Attachments"} ({submissionDocs(submission).length})
                        </h4>
                        <ul>
                          {submissionDocs(submission).map((doc) => (
                            <li key={doc.id}>
                              <Button icon="doc" onClick={() => showDoc(p, doc)}>
                                View {doc.name}
                              </Button>
                              {fileSizeLabel(doc.size) && <small>{fileSizeLabel(doc.size)}</small>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      tab !== "rework" && <p className="role-muted">No attachments with this report.</p>
                    )}
                    <div className="notice subsection">
                      <Icon name="shield" />
                      <p>
                        {tab === "rework"
                          ? "Only the selected affected activities require correction. Review the phase and project impact before confirming; dismissing the request leaves approvals unchanged."
                          : "Review the report here. Checklist activities are reviewed separately in QA/QC evidence; approving or rejecting this report grants or removes no activity credit and does not change the project phase. A rejection needs a reason, which the Site PM sees."}
                      </p>
                    </div>
                    <div className="role-actions">
                      {tab === "rework" ? (
                        <>
                          <Button
                            variant="primary"
                            onClick={() =>
                              setReviewAction({
                                type: "approve_rework",
                                projectId: p.id,
                                requestId:submission.id,
                                expectedVersion: submission.version,
                              })
                            }
                          >
                            Review rework impact
                          </Button>
                          <Button
                            onClick={() =>
                              setReviewAction({
                                type: "decline_rework",
                                projectId: p.id,
                                requestId:submission.id,
                                expectedVersion: submission.version,
                              })
                            }
                          >
                            Decline — no change
                          </Button>
                        </>
                      ) : (
                        <>
                        <Button
                          variant="primary"
                          icon="check"
                          onClick={async () =>
                            await act(
                              {
                                type: "approve_update",
                                projectId: p.id,
                                expectedVersion: submission.version,
                              },
                              "Progress note approved and added to visible history.",
                            )
                          }
                        >
                          Approve progress note
                        </Button>
                        <Button
                          variant="danger-ghost"
                          onClick={() =>
                            setReportReject({
                              projectId: p.id,
                              projectName: p.name,
                              expectedVersion: submission.version,
                            })
                          }
                        >
                          Reject report
                        </Button>
                        </>
                      )}
                    </div>
                  </div>
                </Panel>
              )
            })}
                </>
              )}
            />
            {(tab === "rework" ? pendingRework : pendingUpdates).length ===
              0 && (
              <Empty
                title={
                  tab === "rework"
                    ? "No rework requests awaiting review"
                    : "No progress updates awaiting review"
                }
              />
            )}
          </>
        )}
      </>
    )
  }
  function deadlineList(compact = false) {
    const rows: DeadlineEntry[] = []
    const entry = (
      p: Project,
      kind: string,
      due: number | undefined,
      node: ReactNode,
    ): DeadlineEntry => ({
      key: `${p.id}-${kind}`,
      projectId: p.id,
      projectName: p.name,
      kind,
      due,
      node,
    })
    const qaDue = (p: Project) => {
      const times = checklistFor(p)
        .filter((i) => i.status === "submitted" && i.submittedAt)
        .map((i) => Date.parse(i.submittedAt!) + REVIEW_MS)
        .filter((t) => !Number.isNaN(t))
      return times.length ? Math.min(...times) : undefined
    }
    projects.forEach((p) => {
      const work = workflowFor(p)
      if (isOpm && p.status === "pending" && !p.opmAccepted)
        rows.push(
          entry(p, "accept", undefined,
          <button
            key={`${p.id}-accept`}
            className="deadline-list-item"
            onClick={() => {
              setPickedId(p.id)
              navigate("Confirmation queue")
            }}
          >
            <span className="activity-icon request">
              <Icon name="check" size={17} />
            </span>
            <div>
              <strong>Confirm intake — {p.name}</strong>
              <p>
                Awaiting your acceptance · no automatic Office PM expiry
                defined.
              </p>
            </div>
            <Icon name="arrow" size={17} />
          </button>,
          ),
        )
      if (work.deadline && (isOpm || work.deadline.accountId === actor.id))
        rows.push(
          entry(p, "response", Date.parse(work.deadline.soft),
          <button
            key={`${p.id}-response`}
            className="deadline-list-item"
            onClick={() => {
              setPickedId(p.id)
              if (isOpm) openSiteResponses()
              else navigate("Assignments")
            }}
          >
            <span className="activity-icon request">
              <Icon name="clock" size={17} />
            </span>
            <div>
              <strong>
                {actorName(work.deadline.accountId)} — assignment response
              </strong>
              <p>
                {p.name} · Soft target{" "}
                {new Date(work.deadline.soft).toLocaleString()}
                <br />
                Hard deadline {new Date(work.deadline.hard).toLocaleString()} ·
                weekends excluded.
              </p>
            </div>
            <Badge
              tone={
                Date.now() > Date.parse(work.deadline.soft) ? "red" : "amber"
              }
            >
              {Date.now() > Date.parse(work.deadline.soft)
                ? "Past soft target"
                : "Response pending"}
            </Badge>
          </button>,
          ),
        )
      if (isOpm && work.pendingRework)
        rows.push(
          entry(p, "rework", undefined,
          <button
            key={`${p.id}-rework`}
            className="deadline-list-item"
            onClick={() => {
              navigate("Rework & approvals")
              setTab("rework")
            }}
          >
            <Icon name="alert" />
            <div>
              <strong>Review rework — {p.name}</strong>
              <p>
                Submitted {dateLabel(work.pendingRework.submittedAt)} · manual
                review required; never auto-approved.
              </p>
            </div>
          </button>,
          ),
        )
      if (isOpm && work.pendingUpdate)
        rows.push(
          entry(p, "update", Date.parse(work.pendingUpdate.submittedAt) + REVIEW_MS,
          <button
            key={`${p.id}-update`}
            className="deadline-list-item"
            onClick={() => {
              navigate("Rework & approvals")
              setTab("progress")
            }}
          >
            <Icon name="clock" />
            <div>
              <strong>Review progress — {p.name}</strong>
              <p>
                Three-day review window ends{" "}
                {new Date(
                  Date.parse(work.pendingUpdate.submittedAt) + REVIEW_MS,
                ).toLocaleString()}
                .
              </p>
            </div>
          </button>,
          ),
        )
      if (isOpm && checklistFor(p).some((i) => i.status === "submitted"))
        rows.push(
          entry(p, "qa", qaDue(p),
          <button
            key={`${p.id}-qa`}
            className="deadline-list-item"
            onClick={() => openChecklistApprovals(p)}
          >
            <Icon name="shield" />
            <div>
              <strong>QA/QC review — {p.name}</strong>
              <p>
                {checklistFor(p).filter((i) => i.status === "submitted").length}{" "}
                evidence items pending · escalate after three days, never
                auto-approve.
              </p>
            </div>
          </button>,
          ),
        )
    })
    const emptyState = (
      <Empty title="No actionable deadlines">
        Items needing your action will appear here.
      </Empty>
    )
    // Dashboard preview keeps its short list and "View all" link.
    if (compact) {
      const dashDeadlines = runList(
        `${actor.role}:dash-deadlines`,
        rows,
        { searchText: () => "" },
        { pageSize: 5 },
      )
      return (
        <ListSection
          list={dashDeadlines}
          compact
          empty={emptyState}
          render={(items) => <div>{items.map((row) => row.node)}</div>}
        />
      )
    }
    const KINDS: Record<string, string> = {
      accept: "Confirm intake",
      response: "Assignment response",
      rework: "Rework review",
      update: "Progress review",
      qa: "QA/QC review",
    }
    const urgency = (row: DeadlineEntry) => {
      if (row.due === undefined) return "upcoming"
      const left = row.due - Date.now()
      return left < 0 ? "overdue" : left <= 86_400_000 ? "soon" : "upcoming"
    }
    const deadlinesList = runList(`${actor.role}:deadlines`, rows, {
      searchText: (row) => `${row.projectName} ${KINDS[row.kind]}`,
      filters: [
        {
          id: "urgency",
          label: "Due",
          allLabel: "All deadlines",
          options: [
            { value: "overdue", label: "Overdue" },
            { value: "soon", label: "Due soon (24h)" },
            { value: "upcoming", label: "Upcoming" },
          ],
          test: (row, value) => urgency(row) === value,
        },
        {
          id: "project",
          label: "Project",
          allLabel: "All projects",
          options: optionsFrom(rows.map((row) => row.projectName)),
          test: (row, value) => row.projectName === value,
        },
      ],
    })
    return (
      <ListSection
        list={deadlinesList}
        placeholder="Search deadlines"
        noun="item"
        touch={!isOpm}
        empty={emptyState}
        render={(items) => <div>{items.map((row) => row.node)}</div>}
      />
    )
  }
  function activityList(list = events) {
    return (
      <div className="activity-list">
        {list.length ? (
          list.map((e) => (
            <button
              className="activity-item"
              key={e.id}
              onClick={() => {
                onRead([e.id])
                setBell(false)
                if (isOpm && e.target === "SPM responses") openSiteResponses()
                else if (nav.some(([label]) => label === e.target))
                  navigate(e.target)
                else if (
                  e.projectId &&
                  projects.some((p) => p.id === e.projectId)
                )
                  setDialog({ kind: "project", projectId: e.projectId })
              }}
            >
              <span className={`activity-icon ${e.type}`}>
                <Icon
                  name={
                    e.type === "approval"
                      ? "check"
                      : e.type === "request"
                        ? "clock"
                        : "doc"
                  }
                  size={16}
                />
              </span>
              <span className="activity-copy">
                <strong>{e.title}</strong>
                <small>{e.detail}</small>
                <span className="activity-time">
                  {dateLabel(e.date)} ·{" "}
                  {new Date(e.date).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </span>
              {!e.readBy?.includes(actor.id) && <i className="unread-dot" />}
            </button>
          ))
        ) : (
          <Empty title="No activity in this category" />
        )}
      </div>
    )
  }
  function responseCard(p: Project) {
    return (
      <Panel
        key={p.id}
        title={p.name}
        subtitle={`${p.team.filter((t) => t.status === "confirmed").length}/${p.team.length} phase assignments confirmed`}
      >
        <div className="role-card-content">
          <IntakeGuidance state={state} project={p} actor={actor} />
          {workflowFor(p).deadline && (
            <div className="notice">
              <Icon name="clock" />
              <p>
                Current response window:{" "}
                {actorName(workflowFor(p).deadline!.accountId)}. Hard deadline{" "}
                {new Date(workflowFor(p).deadline!.hard).toLocaleString()}.
              </p>
            </div>
          )}
          {assignmentRoster(p, true)}
          {workflowFor(p).responses.length > 0 && (
            <details className="role-details">
              <summary>Response history</summary>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Site PM</th>
                      <th>Phase</th>
                      <th>Response</th>
                      <th>Date</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workflowFor(p)
                      .responses.slice()
                      .reverse()
                      .map((r) => (
                        <tr key={r.id}>
                          <td>{actorName(r.accountId)}</td>
                          <td>{r.phase}</td>
                          <td>
                            <Status value={r.status} />
                          </td>
                          <td>{dateLabel(r.date)}</td>
                          <td className="wrap-cell">{r.note}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      </Panel>
    )
  }
  function responseTracking() {
    const completed = responseProjects.filter((p) =>
      p.team.every((t) => t.status === "confirmed"),
    )
    const actionList = runList(
      `${actor.role}:responses`,
      responsesNeedingAction,
      {
        searchText: (p) => `${p.name} ${p.type}`,
        filters: [typeFilterP(responsesNeedingAction)],
      },
    )
    const doneList = runList(`${actor.role}:responses-done`, completed, {
      searchText: () => "",
    })
    return (
      <>
        <ListSection
          list={actionList}
          placeholder="Search Site PM responses"
          noun="project"
          touch={!isOpm}
          empty={
            <Empty title="No Site PM responses need action">
              Every phase assignment on your projects is confirmed.
            </Empty>
          }
          render={(items) => <>{items.map(responseCard)}</>}
        />
        {completed.length > 0 && (
          <details className="role-details">
            <summary>Completed ({completed.length})</summary>
            {doneList.view.items.map(responseCard)}
            <ListPager list={doneList} touch={!isOpm} />
          </details>
        )}
      </>
    )
  }
  function directory() {
    const directoryItems = state.companies.filter(
      (company) =>
        company.status === "approved" ||
        company.submittedById === actor.id ||
        company.submittedBy === actor.name,
    )
    const directoryList = runList(`${actor.role}:directory`, directoryItems, {
      searchText: (c) => `${c.name} ${c.contact} ${c.email}`,
      filters: [
        {
          id: "availability",
          label: "Company availability",
          allLabel: "All companies",
          options: [
            { value: "available", label: "Available" },
            { value: "limited", label: "Limited availability" },
            { value: "committed", label: "Fully committed" },
          ],
          test: (c, value) => c.availability === value,
        },
      ],
    })
    return (
      <>
        {header(
          "Subcontractor directory",
          <Button
            icon="plus"
            variant="primary"
            disabled={!requestProjects.length}
            onClick={() =>
              setDialog({ kind: "new-company", projectId: picked?.id })
            }
          >
            Suggest Company
          </Button>,
        )}
        <ListSection
          list={directoryList}
          placeholder="Search the directory"
          noun="company"
          touch={!isOpm}
          empty={<Empty title="No companies match your search" />}
          render={(items) => (
        <div className="company-grid role-directory-grid">
          {items.map((company) => (
            <button
              className="company-card"
              key={company.id}
              onClick={() =>
                setDialog({
                  kind: "company",
                  projectId: picked?.id,
                  companyId: company.id,
                })
              }
            >
              <div className="company-top">
                <span className="company-monogram">
                  {initials(company.name)}
                </span>
                <Status value={company.status} />
              </div>
              <h3>{company.name}</h3>
              <p>{company.email || "Company email not supplied"}</p>
              <div className="company-meta">
                <span>
                  <Icon name="users" size={17} />
                  {company.manpowerCount} available manpower
                </span>
                <span>
                  <Icon name="building" size={17} />
                  {company.activeProjectIds.length} active project commitments
                </span>
                <span>
                  {company.contact || "No contact supplied"} ·{" "}
                  {company.phone || "No phone supplied"}
                </span>
              </div>
              <div className="card-bottom">
                <span>View company details</span>
                <Icon name="arrow" size={16} />
              </div>
            </button>
          ))}
        </div>
          )}
        />
      </>
    )
  }
  function archives() {
    const historical = state.projects.filter((p) =>
      isOpm
        ? p.opmId === actor.id ||
          workflowFor(p).changesHistory?.some((h) => h.opmId === actor.id)
        : isAssigned(p, actor.id) ||
          workflowFor(p).responses.some((r) => r.accountId === actor.id),
    )
    const extraCount =
      archiveTab === "changes"
        ? historical.reduce(
            (n, p) =>
              n +
              (workflowFor(p).changesHistory || []).filter(
                (h) => h.opmId === actor.id,
              ).length,
            0,
          )
        : archiveTab === "companies"
          ? state.companies.filter(
              (c) =>
                (c.submittedById === actor.id ||
                  c.submittedBy === actor.name) &&
                c.status !== "pending",
            ).length
          : historical.reduce(
              (n, p) =>
                n +
                workflowFor(p).responses.filter(
                  (r) =>
                    isOpm ||
                    (r.accountId === actor.id && r.status !== "accepted"),
                ).length,
              0,
            )
    const completedItems = historical.filter(
      (p) =>
        p.status === "completed" ||
        (isOpm && registeredComplete(p) && teamConfirmed(p)),
    )
    const completedArchive = runList(
      `${actor.role}:archive-completed`,
      completedItems,
      {
        searchText: (p) => `${p.name} ${p.type}`,
        filters: [
          typeFilterP(completedItems),
          ...dateFilters<Project>(
            (p) =>
              workflowFor(p).completedAt ||
              p.history[p.history.length - 1]?.date ||
              p.created,
            "Closed",
          ),
        ],
      },
    )
    const changesItems = historical.flatMap((p) =>
      (workflowFor(p).changesHistory || [])
        .filter((h) => h.opmId === actor.id)
        .map((h, i) => ({ p, h, i })),
    )
    const changesArchive = runList(`${actor.role}:archive-changes`, changesItems, {
      searchText: ({ p, h }) => `${p.name} ${h.note}`,
      filters: dateFilters<(typeof changesItems)[number]>(({ h }) => h.date, "Date"),
    })
    const companyItems = state.companies.filter(
      (c) =>
        (c.submittedById === actor.id || c.submittedBy === actor.name) &&
        c.status !== "pending",
    )
    const companiesArchive = runList(`${actor.role}:archive-companies`, companyItems, {
      searchText: (c) => `${c.name} ${selectedProjectName(c.projectId)}`,
      filters: [
        {
          id: "status",
          label: "Status",
          allLabel: "All statuses",
          options: optionsFrom(companyItems.map((c) => c.status)),
          test: (c, value) => c.status === value,
        },
      ],
    })
    const responseItems = historical.flatMap((p) =>
      workflowFor(p)
        .responses.filter(
          (r) =>
            isOpm || (r.accountId === actor.id && r.status !== "accepted"),
        )
        .map((r) => ({ p, r })),
    )
    const responsesArchive = runList(`${actor.role}:archive-responses`, responseItems, {
      searchText: ({ p, r }) => `${p.name} ${r.phase} ${actorName(r.accountId)} ${r.note}`,
      filters: [
        {
          id: "status",
          label: "Response",
          allLabel: "All responses",
          options: optionsFrom(responseItems.map(({ r }) => r.status)),
          test: ({ r }, value) => r.status === value,
        },
        ...dateFilters<(typeof responseItems)[number]>(({ r }) => r.date, "Date"),
      ],
    })
    return (
      <>
        {header(
          "Archive",
        )}
        <div className="tabs standalone">
          {(isOpm
            ? [
                ["completed", "Completed & accepted projects"],
                ["changes", "Changes-requested history"],
                ["responses", "Past SPM responses"],
              ]
            : [
                ["completed", "Completed projects"],
                ["companies", "Subcontractor request history"],
                ["responses", "Declined assignments"],
              ]
          ).map(([value, label]) => (
            <button
              key={value}
              className={archiveTab === value ? "active" : ""}
              onClick={() => setArchiveTab(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <Panel
          title="Historical records"
          subtitle="No manual deletion, stage fast-forwarding, or unverified automatic archive transfer."
        >
          <div className="role-card-content">
            {archiveTab !== "completed" && extraCount === 0 && (
              <Empty title="No resolved records in this category">
                Historical entries appear when your requests or assignment
                responses are resolved.
              </Empty>
            )}
            {archiveTab === "completed" ? (
              <>
                <ListSection
                  list={completedArchive}
                  placeholder="Search completed projects"
                  noun="record"
                  touch={!isOpm}
                  empty={<Empty title="No completed records yet" />}
                  render={(items) => (
                    <>
                      {items.map((p) => (
                        <div className="archive-record" key={p.id}>
                          <span className="file-icon">
                            <Icon name="archive" />
                          </span>
                          <div>
                            <h3>{p.name}</h3>
                            <p>
                              {p.type} ·{" "}
                              {p.status === "completed"
                                ? "Construction closeout record"
                                : "Intake paperwork and team acceptance complete — not necessarily construction complete"}
                            </p>
                          </div>
                          {projects.some((x) => x.id === p.id) && (
                            <Button
                              onClick={() =>
                                setDialog({ kind: "project", projectId: p.id })
                              }
                            >
                              View read-only record
                            </Button>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                />
              </>
            ) : archiveTab === "changes" ? (
              <>
                <ListSection
                  list={changesArchive}
                  placeholder="Search changes history"
                  noun="record"
                  touch={!isOpm}
                  empty={null}
                  render={(items) => (
                    <>
                      {items.map(({ p, h, i }) => (
                        <div className="history-row" key={`${p.id}-${i}`}>
                          <Icon name="doc" />
                          <div>
                            <strong>{p.name}</strong>
                            <p>
                              {h.note} · {dateLabel(h.date)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                />
              </>
            ) : archiveTab === "companies" ? (
              <>
                <ListSection
                  list={companiesArchive}
                  placeholder="Search company requests"
                  noun="request"
                  touch={!isOpm}
                  empty={null}
                  render={(items) => (
                    <>
                      {items.map((c) => (
                        <div className="archive-record" key={c.id}>
                          <div>
                            <h3>{c.name}</h3>
                            <p>{selectedProjectName(c.projectId)}</p>
                          </div>
                          <Status value={c.status} />
                        </div>
                      ))}
                    </>
                  )}
                />
              </>
            ) : (
              <>
                <ListSection
                  list={responsesArchive}
                  placeholder="Search responses"
                  noun="response"
                  touch={!isOpm}
                  empty={null}
                  render={(items) => (
                    <>
                      {items.map(({ p, r }) => (
                        <div className="archive-record" key={r.id}>
                          <div>
                            <h3>
                              {p.name} · {r.phase}
                            </h3>
                            <p>
                              {actorName(r.accountId)} · {r.note} ·{" "}
                              {dateLabel(r.date)}
                            </p>
                          </div>
                          <Status value={r.status} />
                        </div>
                      ))}
                    </>
                  )}
                />
              </>
            )}
          </div>
        </Panel>
      </>
    )
  }
  function projectDetail(p: Project) {
    const work = workflowFor(p)
    return (
      <>
        <div className="detail-hero">
          <span className="project-symbol">
            <Icon name="building" size={28} />
          </span>
          <div>
            <span className="eyebrow">{p.type}</span>
            <h3>{p.name}</h3>
            <p>
              {p.area} sqm · {p.floors} floors · {dateLabel(p.start)} –{" "}
              {p.end ? dateLabel(p.end) : "end not set"}
            </p>
          </div>
          <Status value={p.status} />
        </div>
        <ProjectClientDetails project={p} accounts={state.accounts} />
        <Button icon="doc" onClick={()=>setReportProjectId(p.id)}>Monthly report</Button>
        <IntakeGuidance state={state} project={p} actor={actor} />
        <div className="detail-stats">
          <div>
            <small>RECORDED PROGRESS</small>
            <strong>{p.progress}%</strong>
          </div>
          <div>
            <small>CURRENT PHASE</small>
            <strong>{p.phase}</strong>
          </div>
          <div>
            <small>OFFICE PM</small>
            <strong>{actorName(p.opmId)}</strong>
          </div>
          <div>
            <small>CURRENT OWNER</small>
            <strong>{actorName(phaseOwner(p))}</strong>
          </div>
        </div>
        <OverallProjectProgress name={p.name} verifiedProgress={p.verifiedProgress} />
        <div className="schedule-timeline">
          <PlannedTimeline project={p} />
        </div>
        <PhaseTimeline
          phase={p.phase}
          phases={projectPhaseNames(p)}
          completed={p.status === "completed"}
        />
        {p.status === "pending" && timeline(p)}
        <section className="detail-section">
          <h3>Personnel by phase</h3>
          {assignmentRoster(p, isOpm && p.status !== "completed")}
        </section>
        {isOpm && p.opmId === actor.id && (
          <section className="detail-section">
            <h3>Subcontractor allocation</h3>
            <SubcontractorAllocationReadOnly state={state} project={p} />
          </section>
        )}
        <section className="detail-section">
          <h3>Progress history</h3>
          {p.history
            .slice()
            .reverse()
            .map((h, i) => (
              <div className="history-row" key={i}>
                <Icon name={h.issue ? "alert" : "activity"} size={18} />
                <div>
                  <strong>{h.text}</strong>
                  <p>
                    {dateLabel(h.date)} · {h.phase || p.phase}
                    {h.clientVisible === false
                      ? " · Pending / internal"
                      : " · Approved or baseline history"}
                  </p>
                  {h.evidence && (isOpm || h.authorId === actor.id) && (
                    <Button
                      variant="text-button"
                      icon="doc"
                      onClick={() => showDoc(p, h.evidence!)}
                    >
                      View retained evidence · {h.evidence.name}
                    </Button>
                  )}
                </div>
                <b>{h.progress}%</b>
              </div>
            ))}
        </section>
        <section className="detail-section">
          <h3>Internal site diary</h3>
          {work.notes.length ? (
            work.notes
              .slice()
              .reverse()
              .map((n) => (
                <div className="history-row" key={n.id}>
                  <div>
                    <strong>{n.text}</strong>
                    <p>
                      {actorName(n.authorId)} · {dateLabel(n.date)}
                    </p>
                  </div>
                </div>
              ))
          ) : (
            <p className="role-muted subsection">
              No internal diary notes on file.
            </p>
          )}
        </section>
        <section className="detail-section">
          <h3>Site photo gallery</h3>
          <SitePhotoGallery photos={work.photos} onPreview={doc => showDoc(p, doc)}
            onRelease={isOpm && p.opmId === actor.id && p.status !== "completed" ? async photoId => {
              const saved = await act({ type: "release_photo", projectId: p.id, photoId }, "Photo released to the client.")
              if (!saved) throw new Error("Photo release failed. Refresh the project and try again.")
            } : undefined} />
        </section>
        <section className="detail-section">
          <ProjectProgress key={p.id} project={{ ...p, phases: projectPhaseNames(p) }} />
        </section>
        <PhaseHandoff project={p} actor={actor} />
        {isOpm && p.opmAccepted && (
          <section className="detail-section">
            <h3>Registered project documents</h3>
            {registeredSummary(p)}
          </section>
        )}
        <div className="modal-actions">
          <Button onClick={() => setDialog(undefined)}>Close</Button>
          {isOpm && p.status === "active" && (
            <Button
              icon="bell"
              onClick={async () =>
                await act(
                  { type: "request_update", projectId: p.id },
                  "Site update reminder recorded.",
                )
              }
            >
              Request Site PM update
            </Button>
          )}
          {!isOpm && p.status === "active" && phaseOwner(p) === actor.id && (
            <Button
              variant="primary"
              onClick={() => {
                setPickedId(p.id)
                setDialog(undefined)
                navigate("Active sites")
              }}
            >
              Open phase workspace
            </Button>
          )}
        </div>
      </>
    )
  }
  function registeredSummary(p: Project) {
    const index = projectDocumentIndexFor(p, actor)
    const recent = index
      .flatMap((category) =>
        category.folders.flatMap((folder) =>
          folder.files.map((file) => file.doc),
        ),
      )
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .slice(0, 3)
    return (
      <>
        <div className="tag-list subsection">
          {index.map((category) => (
            <span key={category.id}>
              {category.name} · {category.fileCount}
            </span>
          ))}
        </div>
        {recent.length ? (
          recent.map((doc) => (
            <button
              className="assignment-history"
              key={doc.id}
              onClick={() => showDoc(p, doc)}
            >
              <Icon name="doc" />
              <span>
                <strong>{doc.label}</strong>
                <small>
                  {doc.name} · {dateLabel(doc.date)} · {doc.owner}
                </small>
              </span>
              <Icon name="search" size={18} />
            </button>
          ))
        ) : (
          <p className="role-muted subsection">No documents available yet.</p>
        )}
        <Button
          icon="folder"
          onClick={(event) => {
            const body = event.currentTarget.closest(".modal-body")
            modalBody.current = body
            monitorScroll.current = body?.scrollTop ?? 0
            setMonitorView("repository")
          }}
        >
          View All in Document Repository
        </Button>
      </>
    )
  }
  function monitoringRepository(p: Project) {
    return (
      <div style={{ minHeight: "calc(92vh - 190px)" }}>
        <div className="document-browser-back">
          <Button
            variant="text-button"
            onClick={(event) => {
              const body = event.currentTarget.closest(".modal-body")
              modalBody.current = body
              setMonitorView("monitoring")
            }}
          >
            ← Back to Project Monitoring
          </Button>
        </div>
        <DocumentRepository
          listKey={`${actor.role}:monitor-documents`}
          className="role-document-browser"
          projects={[repositoryProject(p)]}
          lockedProjectId={p.id}
          rootLabel="Document repository"
          path={repoPath}
          onPathChange={setRepoPath}
          query={repoQuery}
          onQueryChange={setRepoQuery}
          searchInProject
          fileDetails
          renderStatus={(value) => <Status value={value} />}
          emptyDetail="Original uploads will appear here when submitted through the responsible workflow."
          onOpen={(_projectId, fileId) => openIndexedDoc(p, fileId)}
          onDownload={(_projectId, fileId) => {
            const doc = findIndexedDoc(
              projectDocumentIndexFor(p, actor),
              fileId,
            )
            if (doc) void downloadDoc(doc)
          }}
        />
      </div>
    )
  }
  function companyDetail(c: Company) {
    return (
      <>
        <div className="detail-hero">
          <span className="company-monogram large">{initials(c.name)}</span>
          <div>
            <h3>{c.name}</h3>
            <p>{c.email || "Company email not supplied"}</p>
          </div>
          <Status value={c.status} />
        </div>
        <div className="detail-grid account-detail-grid">
          <div>
            <small>CONTACT PERSON</small>
            <strong>{c.contact || "Not supplied"}</strong>
          </div>
          <div>
            <small>PHONE</small>
            <strong>{c.phone || "Not supplied"}</strong>
          </div>
          <div>
            <small>AVAILABILITY</small>
            <strong>{c.availability}</strong>
          </div>
          <div>
            <small>AVAILABLE MANPOWER</small>
            <strong>{c.manpowerCount}</strong>
          </div>
        </div>
        <section className="detail-section">
          <h3>Active project commitments</h3>
          <div className="tag-list subsection">
            {c.activeProjectIds.map((projectId) => (
              <span key={projectId}>{selectedProjectName(projectId)}</span>
            ))}
          </div>
          {!c.activeProjectIds.length && (
            <Empty title="No active project commitments" />
          )}
        </section>
        <section className="detail-section">
          <h3>Manpower list documents</h3>
          <p className="role-muted subsection">
            Company-level files only. Individual workers are not stored in the
            directory.
          </p>
          {c.manpowerDocuments.map((document) => (
            <div className="document-row" key={document.id}>
              <span className="file-icon">
                <Icon name="doc" />
              </span>
              <div className="document-info">
                <strong>{document.label}</strong>
                <p>
                  {document.name} · {dateLabel(document.date)}
                </p>
              </div>
              <Status value="on file" />
            </div>
          ))}
          {!c.manpowerDocuments.length && (
            <Empty title="No manpower list documents" />
          )}
        </section>
        {c.status === "pending" &&
          (c.submittedById === actor.id || c.submittedBy === actor.name) && (
            <div className="modal-actions">
              <Button
                variant="danger-ghost"
                onClick={async () => {
                  if (
                    await act(
                      {
                        type: "archive_company_request",
                        projectId: c.projectId,
                        companyId: c.id,
                      },
                      "Pending suggestion archived.",
                    )
                  )
                    setDialog(undefined)
                }}
              >
                Archive suggestion
              </Button>
            </div>
          )}
      </>
    )
  }
  function renderPage() {
    if (page === "Reports") return <Reports />
    switch (page) {
      case "Dashboard":
        return dashboard()
      case "Confirmation queue":
        return (
          <>
            {header(
              "Confirmation queue",
            )}
            <div className="tabs standalone">
              {[
                ["mine", `Intake overview (${intakes.length})`],
                [
                  "responses",
                  `Site PM responses (${responsesNeedingAction.length})`,
                ],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={confirmTab === value ? "active" : ""}
                  onClick={() => { setConfirmTab(value); for (const key of [`${actor.role}:confirmations`, `${actor.role}:responses`, `${actor.role}:responses-done`]) updateListQuery(key, q => withPage(q, 1)) }}
                >
                  {label}
                </button>
              ))}
            </div>
            {confirmTab === "responses" ? (
              responseTracking()
            ) : (
              <><IntakeTabs value={intakeView} counts={intakeCounts} onChange={value => { setIntakeView(value); updateListQuery(`${actor.role}:confirmations`, q => withPage(q, 1)) }} /><ListSection
                list={intakesList}
                placeholder="Search confirmations"
                noun="project"
                touch={!isOpm}
                empty={
                  <Empty title={!intakes.length ? "No intake assignments" : intakeView === "action" ? "No intake actions for your account" : "No intake records waiting for others"} />
                }
                render={(items) => <>{items.map(confirmationCard)}</>}
              /></>
            )}
          </>
        )
      case "Documents":
      case "Document repository":
        return documentWorkspace()
      case "Assignments":
        return assignmentPage()
      case "Active sites":
        return activeSites()
      case "Deadlines":
        return (
          <>
            {header(
              "Deadlines & follow-ups",
            )}
            <Panel
              title="Upcoming responsibilities"
              subtitle="Timers run while SITELINE is open and are checked again on reload."
            >
              {deadlineList()}
            </Panel>
          </>
        )
      case "Rework & approvals":
        return reviews()
      case "Subcon directory":
        return directory()
      case "Archive":
        return archives()
      case "Activity log":
        return (
          <>
            {header(
              "Activity log",
            )}
            <Panel title="Project activity">
              <ListSection
                list={activityFeed}
                placeholder="Search activity"
                noun="event"
                touch={!isOpm}
                render={(items) => activityList(items)}
                empty={activityList([])}
              />
            </Panel>
          </>
        )
      case "Preferences":
        return (
          <>
            {header(
              "Your preferences",
            )}
            <Panel
              title="Notification preferences"
              subtitle="These settings do not change organization-wide rules."
            >
              <div className="notification-settings">
                {["request", "approval", "progress", "notice"].map((type) => (
                  <label className="preference-row" key={type}>
                    <span>
                      <strong>
                        {type[0].toUpperCase() + type.slice(1)} updates
                      </strong>
                      <small>
                        Keep records in the activity log while controlling your
                        notification inbox.
                      </small>
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={!muted.includes(type)}
                      disabled={notificationSave?.pending}
                      onChange={() => onMute(type)}
                    />
                  </label>
                ))}
              </div>
            </Panel>
            <Panel title="Your account">
              <div className="role-card-content">
                <div className="detail-hero">
                  <span className="avatar large">{initials(actor.name)}</span>
                  <div>
                    <h3>{actor.name}</h3>
                    <p>
                      {actor.email} · {ROLE_NAMES[actor.role]}
                    </p>
                  </div>
                </div>
                <div className="notice subsection">
                  <Icon name="shield" />
                  <p>
                    Only Administrator can change organization rules, account
                    scope, professional credentials and account status.
                  </p>
                </div>
              </div>
            </Panel>
          </>
        )
      default:
        return null
    }
  }
  return (
    <div className="app-shell role-workspace">
      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <div className="workspace-switch">
          <span className="workspace-avatar">10</span>
          <span>
            <strong>10 Builders</strong>
            <small>{ROLE_NAMES[actor.role]} workspace</small>
          </span>
        </div>
        <div className="brand">
          <span className="brand-mark">
            10
          </span>
          <div>
            Siteline<small>10 BUILDERS</small>
          </div>
        </div>
        <nav aria-label="Main navigation">
          {nav.map(([label, icon], i) => (
            <div key={label}>
              {[0, 6, 9].includes(i) && (
                <div className="nav-group-label">
                  {i === 0 ? "WORKSPACE" : i === 9 ? "PERSONAL" : "RESOURCES"}
                </div>
              )}
              <button
                className={`nav-item ${page === label ? "active" : ""}`}
                aria-label={label}
                aria-description={navigationCounts[label]?.count ? `${navigationCounts[label].count} ${navigationCounts[label].description}` : undefined}
                onClick={() => navigate(label)}
              >
                <Icon name={icon} size={19} />
                <span>{label}</span>
                <NavigationCount item={navigationCounts[label]} />
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-person">
            <button className="topbar-avatar avatar" aria-label="View my profile" onClick={() => setProfileOpen(true)}>{initials(actor.name)}</button>
            <span>
              <strong>{actor.name}</strong>
              <small>{ROLE_NAMES[actor.role]}</small>
            </span>
            <Button
              variant="icon-button"
              icon="logout"
              aria-label="Sign out"
              onClick={onPause}
            />
          </div>
        </div>
      </aside>
      {mobileNav && (
        <div
          className="mobile-nav-backdrop"
          onClick={() => setMobileNav(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <Button
              className="mobile-menu"
              icon="menu"
              variant="icon-button"
              aria-label="Open navigation"
              onClick={() => setMobileNav(!mobileNav)}
            />
            <span>{ROLE_NAMES[actor.role]}</span>
            <Icon name="chevron" size={14} />
            <strong>{page}</strong>
          </div>
          <div className="topbar-actions">
            <div className="notification-container">
              <Button
                icon="bell"
                variant="icon-button"
                aria-label={`Notifications, ${unread} unread`}
                onClick={() => setBell(!bell)}
              />
              {unread > 0 && <i className="notification-dot" />}
              {bell && (
                <div className="notification-popover">
                  <div className="popover-heading">
                    <h3>Your notifications</h3>
                    <Button
                      variant="text-button"
                      onClick={() => onRead(events.map((e) => e.id))}
                    >
                      Mark all read
                    </Button>
                  </div>
                  {activityList(
                    events
                      .filter(
                        (e) =>
                          !muted.includes(e.type) &&
                          [
                            "request",
                            "approval",
                            "progress",
                            "notice",
                          ].includes(e.type),
                      )
                      .slice(0, 8),
                  )}
                  <Button
                    className="full-width"
                    onClick={() => navigate("Activity log")}
                  >
                    Open full activity log
                    <Icon name="arrow" size={16} />
                  </Button>
                </div>
              )}
            </div>
            <button className="topbar-avatar avatar" aria-label="View my profile" onClick={() => setProfileOpen(true)}>{initials(actor.name)}</button>
          </div>
        </header>
        <main className="main-content">
          {notificationSave && <NotificationSaveStatus {...notificationSave} />}
          <div className={page === "Dashboard" && welcomeGreeting ? "workspace-meta has-greeting" : "workspace-meta"}>
            {page === "Dashboard" && <DashboardWelcome greeting={welcomeGreeting} />}
            <span>
              <Icon name="calendar" size={15} />
              {dateLabel(today())}
            </span>
          </div>
          {error && (
            <div className="role-error" role="alert">
              <Icon name="alert" />
              <span>{error}</span>
              <Button
                variant="icon-button"
                icon="close"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              />
            </div>
          )}
          {renderPage()}
          <div className="workspace-footer">
            <span>
              SITELINE <span>Built for the work ahead.</span>
            </span>
          </div>
        </main>
      </div>
      {acceptedId && (
        <Modal
          title="Project assignment confirmed!"
          subtitle={selectedProjectName(acceptedId)}
          onClose={() => setAcceptedId("")}
        >
          <div className="success-state">
            <span>
              <Icon name="check" size={30} />
            </span>
            <h3>Next step: upload project documents</h3>
            <p>
              You accepted the Office PM assignment. Upload all six required
              documents before the Lead Site PM can accept.
            </p>
          </div>
          <div className="modal-actions">
            <Button onClick={() => setAcceptedId("")}>Later</Button>
            <Button
              variant="primary"
              icon="upload"
              onClick={() => {
                const p = projects.find((p) => p.id === acceptedId)
                setAcceptedId("")
                if (p) openDocuments(p)
              }}
            >
              Continue to Document Upload
            </Button>
          </div>
        </Modal>
      )}
      {dialog?.kind === "changes" && detail && (
        <Modal
          title="Request intake changes"
          subtitle={detail.name}
          onClose={() => setDialog(undefined)}
        >
          <Field label="Change request note">
            <textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              rows={3}
              placeholder="Describe the staffing or intake concern."
            />
          </Field>
          <div className="notice subsection">
            <Icon name="clock" />
            <p>
              This returns intake to Admin, excludes you from this project’s
              resubmission pool, and starts the source-defined 24-hour Office PM
              recommendation cooldown.
            </p>
          </div>
          <div className="modal-actions">
            <Button onClick={() => setDialog(undefined)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (
                  await act(
                    {
                      type: "request_changes",
                      projectId: detail.id,
                      note: declineReason,
                    },
                    "Change request sent to Administrator.",
                  )
                )
                  setDialog(undefined)
              }}
            >
              Return to Admin
            </Button>
          </div>
        </Modal>
      )}
      {dialog?.kind === "decline" && detail && (
        <Modal
          title={`Decline ${dialog.phase} assignment`}
          subtitle={detail.name}
          onClose={() => setDialog(undefined)}
        >
          <Field
            label={
              dialog.phase === "Mobilization"
                ? "Decline reason *"
                : "Decline note (optional)"
            }
          >
            <textarea
              rows={3}
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
            />
          </Field>
          <p className="role-muted subsection">
            Declining routes this responsibility to the Office PM for
            reassignment. Lead decline also resets intake document readiness,
            preserving prior files in the internal audit record.
          </p>
          <div className="modal-actions">
            <Button onClick={() => setDialog(undefined)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (
                  await act(
                    {
                      type: "decline_assignment",
                      projectId: detail.id,
                      phase: dialog.phase,
                      note: declineReason,
                    },
                    "Decline recorded; Office PM reassignment required.",
                  )
                )
                  setDialog(undefined)
              }}
            >
              Confirm decline
            </Button>
          </div>
        </Modal>
      )}
      {dialog?.kind === "project" &&
        detail &&
        projects.some((p) => p.id === detail.id) && (
          <Modal
            title={
              monitorView === "repository"
                ? "Project documents"
                : "Project monitoring"
            }
            subtitle={
              monitorView === "repository"
                ? `${ROLE_NAMES[actor.role]} · ${detail.name}`
                : detail.name
            }
            wide
            onClose={() => setDialog(undefined)}
          >
            {monitorView === "repository" && isOpm
              ? monitoringRepository(detail)
              : projectDetail(detail)}
          </Modal>
        )}
      {reportProjectId && <MonthlyReport projects={projects} initialProjectId={reportProjectId} onClose={()=>setReportProjectId("")} />}
      {dialog?.kind === "company" && company && (
        <Modal
          title="Subcontractor profile"
          wide
          onClose={() => setDialog(undefined)}
        >
          {companyDetail(company)}
        </Modal>
      )}
      {dialog?.kind === "new-company" && (
        <Modal
          title="Suggest a subcontractor company"
          subtitle="Company approval is separate from project acceptance."
          wide
          onClose={() => setDialog(undefined)}
        >
          <NewCompanyForm
            actor={actor}
            project={
              requestProjects.find((p) => p.id === dialog.projectId) ||
              requestProjects[0]
            }
            projects={requestProjects}
            onClose={() => setDialog(undefined)}
            onSave={async (c, projectId) => {
              if (
                await act(
                  { type: "request_company", projectId, company: c },
                  "Company suggestion sent for Administrator verification.",
                )
              )
                setDialog(undefined)
            }}
          />
        </Modal>
      )}
      {dialog?.kind === "activated" && detail && (
        <Modal
          title="Project activated"
          subtitle={detail.name}
          onClose={() => setDialog(undefined)}
        >
          <div className="success-state">
            <span>
              <Icon name="check" size={32} />
            </span>
            <h3>All final checks passed.</h3>
            <p>
              Office PM documents, Site PM acceptances, subcontractor responses,
              signed agreement and client linkage are complete.
            </p>
          </div>
          <div className="modal-actions">
            <Button onClick={() => setDialog(undefined)}>Done</Button>
            <Button
              variant="primary"
              onClick={() => {
                setPickedId(detail.id)
                setDialog(undefined)
                navigate("Active sites")
              }}
            >
              View Active Sites
            </Button>
          </div>
        </Modal>
      )}
      {evidenceReview && (
        <EvidenceReview key={`${evidenceReview.projectId}-${evidenceReview.evidenceId}-${evidenceReview.type}`}
          projectId={evidenceReview.projectId!} evidenceId={evidenceReview.evidenceId || ""}
          reject={evidenceReview.type==="reject_checklist"} onClose={()=>setEvidenceReview(undefined)}
          onConfirm={(expectedReviewToken,note)=>act({...evidenceReview,expectedReviewToken,note},
            evidenceReview.type==="reject_checklist" ? "Activity evidence rejected. Site PM can resubmit corrections." : "Activity approved; verified progress recalculated.")} />
      )}
      {reportReject && (
        <ReportRejectDialog
          projectName={reportReject.projectName}
          onReject={(reason) =>
            Promise.resolve(
              onCommand({
                type: "reject_update",
                projectId: reportReject.projectId,
                expectedVersion: reportReject.expectedVersion,
                note: reason,
              }),
            )
          }
          onStale={() => void onReload()}
          onClose={() => setReportReject(undefined)}
          onDone={() => {
            setReportReject(undefined)
            setError("")
            setMessage("Progress report rejected. The Site PM can submit a new report.")
          }}
        />
      )}
      {reviewAction && (
        <ReworkReview key={`${reviewAction.requestId}-${reviewAction.type}`} requestId={reviewAction.requestId!}
          confirm={reviewAction.type==="approve_rework"} onClose={()=>setReviewAction(undefined)}
          onConfirm={(expectedReviewToken,selectedActivityIds,note)=>act({...reviewAction,expectedReviewToken,selectedActivityIds,note},"Rework decision recorded.")}/>
      )}
      {profileOpen && <MyProfile actor={actor} projects={projects} onClose={() => setProfileOpen(false)} />}
      {preview && (
        <Preview
          doc={preview}
          viewer={actor.name}
          downloadable={isOpm}
          onClose={() => setPreview(undefined)}
        />
      )}
      {completedProjectId && (
        <Modal
          title="Construction project completed"
          subtitle={selectedProjectName(completedProjectId)}
          onClose={() => setCompletedProjectId("")}
        >
          <div className="success-state">
            <span>
              <Icon name="check" size={32} />
            </span>
            <h3>All required Closeout sign-offs are complete.</h3>
            <p>
              Outstanding progress and rework reviews are resolved. The project
              is now a read-only completion record, available in Archive and to
              its authorized Client.
            </p>
          </div>
          <div className="modal-actions">
            <Button onClick={() => setCompletedProjectId("")}>Done</Button>
            <Button
              variant="primary"
              onClick={() => {
                setCompletedProjectId("")
                setArchiveTab("completed")
                navigate("Archive")
              }}
            >
              View Archive
            </Button>
          </div>
        </Modal>
      )}
      {message && (
        <div className="toast" role="status">
          <Icon name="check" size={18} />
          {message}
          <Button
            icon="close"
            variant="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setMessage("")}
          />
        </div>
      )}
      {idleWarning && !paused && (
        <div className="session-warning">
          <Icon name="clock" />
          <span>Your local session will pause after inactivity.</span>
          <Button onClick={onStayActive}>Stay signed in</Button>
        </div>
      )}
      {paused && (
        <div className="session-overlay">
          <div className="session-card">
            <span className="brand-mark">
              <Icon name="building" size={28} />
            </span>
            <h1>SITELINE</h1>
            <p>{actor.name}, your session has ended.</p>
            <Button variant="primary" onClick={onResume}>
              Sign in again
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
function NewCompanyForm({
  actor,
  project,
  projects,
  onSave,
  onClose,
}: {
  actor: Account
  project?: Project
  projects: Project[]
  onSave: (company: Company, projectId: string) => void
  onClose: () => void
}) {
  const [projectId, setProjectId] = useState(project?.id || "")
  const [draft, setDraft] = useState<Company>({
    id: uid(),
    name: "",
    contact: "",
    phone: "",
    email: "",
    status: "pending",
    submittedBy: actor.name,
    submittedById: actor.id,
    projectId: project?.id || "",
    availability: "available",
    manpowerCount: 0,
    activeProjectIds: [],
    manpowerDocuments: [],
    documents: [],
    note: "",
    version: 1,
  })
  const [error, setError] = useState("")
  function patch(values: Partial<Company>) {
    setDraft((c) => ({ ...c, ...values }))
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!draft.name.trim() || !projectId) {
          setError("Company name and an assigned project are required.")
          return
        }
        onSave(
          {
            ...draft,
            name: draft.name.trim(),
            projectId,
          },
          projectId,
        )
      }}
    >
      <div className="form-grid">
        <Field label="Company name *">
          <input
            required
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </Field>
        <Field label="Contact person">
          <input
            value={draft.contact}
            onChange={(e) => patch({ contact: e.target.value })}
          />
        </Field>
        <Field label="Contact number">
          <input
            value={draft.phone}
            onChange={(e) => patch({ phone: e.target.value })}
          />
        </Field>
        <Field label="Company email">
          <input
            type="email"
            value={draft.email}
            onChange={(e) => patch({ email: e.target.value })}
          />
        </Field>
        <Field label="Related assigned project *">
          <select
            required
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">Choose your project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Company availability">
          <select
            value={draft.availability}
            onChange={(event) =>
              patch({
                availability: event.target.value as Company["availability"],
              })
            }
          >
            <option value="available">Available</option>
            <option value="limited">Limited availability</option>
            <option value="committed">Fully committed</option>
          </select>
        </Field>
        <Field label="Available manpower">
          <input
            type="number"
            min={0}
            value={draft.manpowerCount}
            onChange={(event) =>
              patch({ manpowerCount: Number(event.target.value) })
            }
          />
        </Field>
      </div>
      <section className="form-section">
        <h3>Optional manpower list document</h3>
        <p>
          Upload the company-level XLSX or XLS list. SITELINE does not create
          individual worker records from this file.
        </p>
        <Upload
          spreadsheet
          label="Company Manpower List"
          owner={actor.name}
          buttonLabel="Upload manpower list"
          onSave={(document) =>
            patch({
              manpowerDocuments: [...draft.manpowerDocuments, document],
            })
          }
        />
        {!!draft.manpowerDocuments.length && (
          <p>
            {draft.manpowerDocuments.length} manpower list document
            {draft.manpowerDocuments.length === 1 ? "" : "s"} attached.
          </p>
        )}
      </section>
      <section className="form-section">
        <h3>Optional supporting document</h3>
        {draft.documents.length ? (
          <Badge tone="green">{draft.documents[0].name} confirmed</Badge>
        ) : (
          <Upload
            label="Company supporting document"
            owner={actor.name}
            onSave={(doc) => patch({ documents: [...draft.documents, doc] })}
          />
        )}
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" type="submit">
          Submit for Admin approval
        </Button>
      </div>
    </form>
  )
}

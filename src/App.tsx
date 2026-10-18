// @refresh reset
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react"
import RoleWorkspace from "./RoleWorkspace"
import LoginPage from "./LoginPage"
import { assertCanSignIn } from "./auth"
import { stubAccount } from "./api/adapter"
import {
  api,
  apiEnabled,
  ApiError,
  login as apiLogin,
  logout as apiLogout,
  tokenUser,
} from "./api/client"
import { loadState as loadApiState } from "./api/load"
import { ClientSubconAdminCard } from "./ClientSubconReview"
import ClientPortal from "./ClientPortal"
import PlannedTimeline from "./PlannedTimeline"
import {
  clientProjectViews,
  clientProgressReport,
  resolveClientDocument,
  resolveClientPhoto,
} from "./client-access"
import {
  activeAssignmentsForAccount,
  applyWorkflow,
  beginAccountResignation,
  resolveClientSubconIssue,
  registeredComplete,
  teamConfirmed,
  type WorkflowCommand,
} from "./workflows"
import { Badge, Button, Empty, Field, Icon, Modal } from "./ui"
import {
  AccountDeactivationForm,
  AccountForm,
  Chart,
  CompanyForm,
  DocumentList,
  downloadBlob,
  downloadDoc,
  IntakeForm,
  LicenseForm,
  Preview,
  SettingsForm,
  Upload,
} from "./panels"
import {
  dateLabel,
  headcount,
  initials,
  emptyState,
  licenseState,
  projectPhaseDisciplines,
  projectPhaseNames,
  ROLE_NAMES,
  spmCandidates,
  today,
  uid,
  workload,
  projectDateErrors,
  type Account,
  type Company,
  type Doc,
  type Event,
  type Project,
  type State,
} from "./model"
import { projectDocumentIndex } from "./project-document-index"
import {
  ADMIN_NAV,
  DIRECTORY_TABS,
  DOCUMENT_TABS,
  adminBreadcrumb,
  resolveAdminTarget,
  type DirectoryTab,
  type DocumentsTab,
} from "./adminNav"
import DocumentRepository, {
  findIndexedDoc,
  staffRepositoryCategories,
} from "./DocumentRepository"

const SESSION_KEY = "siteline-session-account"
const NAV = ADMIN_NAV
type Dialog = {
  kind: string
  id?: string
  extra?: string
}
const STATUS: Record<string, string> = {
  "pending-setup": "Pending project setup",
  active: "Active",
  pending: "Awaiting Office PM",
  changes_requested: "Changes requested",
  draft: "Draft",
  completed: "Completed",
  declined: "Declined intake",
  expired: "Expired assignment",
  deactivated: "Deactivated",
  archived: "Archived",
}
function Status({ status }: { status: string }) {
  return (
    <Badge
      tone={
        [
          "active",
          "approved",
          "completed",
          "Valid",
          "Renewed",
          "confirmed",
        ].includes(status)
          ? "green"
          : [
                "pending",
                "changes_requested",
                "invited",
                "Expiring soon",
              ].includes(status)
            ? "amber"
            : [
                  "suspended",
                  "deactivated",
                  "rejected",
                  "Grace expired",
                  "Expired",
                  "declined",
                ].includes(status)
              ? "red"
              : ""
      }
    >
      {STATUS[status] || status.replace(/_/g, " ")}
    </Badge>
  )
}
function Panel({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
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
function Search({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string
  onChange: (s: string) => void
  placeholder?: string
}) {
  return (
    <div className="search-field">
      <Icon name="search" size={18} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <Button
          variant="icon-button"
          icon="close"
          aria-label="Clear search"
          onClick={() => onChange("")}
        />
      )}
    </div>
  )
}
const API_READ_ONLY_MESSAGE =
  "Connected to the server in view-only mode. Saving changes is not available yet."
const ACCOUNT_UNAVAILABLE_MESSAGE =
  "This account is not active. Contact your Administrator."
const INVALID_CREDENTIALS_MESSAGE =
  "The email or password you entered is incorrect."
function AppInner() {
  const [state, setState] = useState<State>(emptyState)
  const [sessionId, setSessionId] = useState(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) || ""
    } catch {
      return ""
    }
  })
  const stateRef = useRef(state)
  stateRef.current = state
  const actor =
    state.accounts.find((a) => a.id === sessionId) ||
    stubAccount("", "", "client")
  const [page, setPage] = useState("Dashboard")
  const [dialog, setDialog] = useState<Dialog>()
  const [preview, setPreview] = useState<Doc>()
  const [toast, setToast] = useState("")
  const [query, setQuery] = useState("")
  const [globalQuery, setGlobalQuery] = useState("")
  const [filter, setFilter] = useState("all")
  const [subconTab, setSubconTab] = useState("registered")
  const [documentsTab, setDocumentsTab] = useState<DocumentsTab>("project")
  const [directoryTab, setDirectoryTab] = useState<DirectoryTab>("engineers")
  const [tab, setTab] = useState("closed")
  const [mobileNav, setMobileNav] = useState(false)
  const [notifications, setNotifications] = useState(false)
  const [credentials, setCredentials] = useState<{
    name: string
    password: string
  }>()
  const [confirmation, setConfirmation] = useState<{
    title: string
    message: string
    action: () => void
    destructive?: boolean
  }>()
  const [signedOut, setSignedOut] = useState(true)
  const [checkingSession, setCheckingSession] = useState(true)
  const [idleWarning, setIdleWarning] = useState(false)
  const [archiveDays, setArchiveDays] = useState(60)
  const [roleFilter, setRoleFilter] = useState("all")
  const [licenseFilter, setLicenseFilter] = useState("all")
  const [activityFilter, setActivityFilter] = useState("all")
  const active = state.projects.filter((p) => p.status === "active")
  const intake = state.projects.filter((p) =>
    ["pending", "draft", "changes_requested"].includes(p.status),
  )
  const pending = state.companies.filter((c) => c.status === "pending")
  const engineers = state.accounts.filter((a) => a.role !== "client")
  const licenseAlerts = engineers.filter(
    (a) =>
      ["Expired", "Grace expired", "Expiring soon"].includes(
        licenseState(a, state.rules.grace),
      ) && a.status === "active",
  )
  const unread = state.events.filter(
    (e) =>
      !e.read &&
      !state.muted.includes(e.type) &&
      ["request", "approval", "progress", "notice"].includes(e.type),
  ).length
  const admin =
    actor.role === "admin"
      ? actor
      : state.accounts.find((a) => a.role === "admin") || actor
  const nameFor = (id: string) =>
    state.accounts.find((a) => a.id === id)?.name || "Unassigned"
  const projectFor = (id: string) =>
    state.projects.find((p) => p.id === id)?.name || "No project"
  const selectedProject = state.projects.find((p) => p.id === dialog?.id)
  const selectedAccount = state.accounts.find((a) => a.id === dialog?.id)
  const selectedCompany = state.companies.find((c) => c.id === dialog?.id)

  useEffect(() => {
    if (!tokenUser()) {
      setCheckingSession(false)
      return
    }
    let cancelled = false
    api<Parameters<typeof startApiSession>[0]>("/auth/me")
      .then(startApiSession)
      .then((account) => {
        if (cancelled) return
        setSessionId(account.id)
        setSignedOut(false)
      })
      .catch(() => {
        if (cancelled) return
        clearSession()
        apiLogout()
      })
      .finally(() => {
        if (!cancelled) setCheckingSession(false)
      })
    return () => {
      cancelled = true
    }
  }, [])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(""), 5000)
    return () => clearTimeout(t)
  }, [toast])
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        if (!signedOut && actor.role === "admin") setDialog({ kind: "search" })
      }
      if (event.key === "Escape") setNotifications(false)
    }
    const outside = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest(".notification-container"))
        setNotifications(false)
    }
    window.addEventListener("keydown", keyboard)
    window.addEventListener("pointerdown", outside)
    return () => {
      window.removeEventListener("keydown", keyboard)
      window.removeEventListener("pointerdown", outside)
    }
  }, [signedOut, actor.role])
  useEffect(() => {
    if (signedOut) return
    let warning: ReturnType<typeof setTimeout>
    let logout: ReturnType<typeof setTimeout>
    const reset = () => {
      clearTimeout(warning)
      clearTimeout(logout)
      setIdleWarning(false)
      const time = state.rules.idle * 60000
      warning = setTimeout(
        () => setIdleWarning(true),
        Math.max(0, time - 60000),
      )
      logout = setTimeout(() => {
        endSession()
        setIdleWarning(false)
      }, time)
    }
    const events = ["pointerdown", "keydown", "scroll"]
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    reset()
    return () => {
      clearTimeout(warning)
      clearTimeout(logout)
      events.forEach((e) => window.removeEventListener(e, reset))
    }
  }, [state.rules.idle, signedOut])

  function log(
    draft: State,
    title: string,
    detail: string,
    type = "account",
    target = page,
  ): State {
    return {
      ...draft,
      events: [
        {
          id: uid(),
          title,
          detail,
          type,
          date: new Date().toISOString(),
          read: false,
          target,
        },
        ...draft.events,
      ],
    }
  }
  function commit(
    change: (s: State) => State,
    title: string,
    detail = "",
    type = "account",
    target = page,
  ) {
    if (signedOut || actor.role !== "admin") {
      setToast("Sign in again to continue.")
      return
    }
    if (apiEnabled) {
      setToast(API_READ_ONLY_MESSAGE)
      return
    }
    setState((s) => log(change(s), title, detail, type, target))
    setToast(title)
  }
  function resetListState() {
    setQuery("")
    setFilter("all")
    setSubconTab("registered")
    setRoleFilter("all")
    setLicenseFilter("all")
  }
  // Old page names (stored notification targets, links) open the matching tab of Documents/Directory.
  function navigate(next: string) {
    const target = resolveAdminTarget(next)
    setPage(target ? target.page : next)
    resetListState()
    if (target?.documentsTab) setDocumentsTab(target.documentsTab)
    if (target?.directoryTab) setDirectoryTab(target.directoryTab)
    if (target?.subconTab) setSubconTab(target.subconTab)
    setMobileNav(false)
    setNotifications(false)
  }
  function selectDocumentsTab(tab: DocumentsTab) {
    resetListState()
    setDocumentsTab(tab)
  }
  function selectDirectoryTab(tab: DirectoryTab) {
    resetListState()
    setDirectoryTab(tab)
  }
  function openPendingRequests() {
    navigate("Approvals")
  }
  function openTarget(target: string) {
    if (target === "Approvals") openPendingRequests()
    else navigate(target)
  }
  function clearSession() {
    try {
      sessionStorage.removeItem(SESSION_KEY)
    } catch {
      /* The signed-out state remains effective in memory. */
    }
  }
  // Loads everything the signed-in role may see and checks the account may sign in.
  async function startApiSession(user: {
    id: string
    role: Account["role"]
    full_name?: string
    email?: string
  }): Promise<Account> {
    const loaded = await loadApiState(user)
    const account = loaded.accounts.find((a) => a.id === user.id)
    try {
      if (!account) throw new Error(ACCOUNT_UNAVAILABLE_MESSAGE)
      assertCanSignIn(loaded, account)
    } catch (error) {
      await apiLogout()
      throw error
    }
    stateRef.current = loaded
    setState(loaded)
    return account
  }
  async function signIn(email: string, password: string) {
    let user: Awaited<ReturnType<typeof apiLogin>>
    try {
      user = await apiLogin(email, password)
    } catch (error) {
      throw new Error(
        error instanceof ApiError &&
          error.status !== 401 &&
          error.status !== 400
          ? error.message
          : INVALID_CREDENTIALS_MESSAGE,
      )
    }
    let account: Account
    try {
      account = await startApiSession(user)
    } catch (error) {
      await apiLogout()
      throw error
    }
    setDialog(undefined)
    setPreview(undefined)
    setConfirmation(undefined)
    setCredentials(undefined)
    setNotifications(false)
    setSessionId(account.id)
    setSignedOut(false)
    setPage("Dashboard")
    try {
      sessionStorage.setItem(SESSION_KEY, account.id)
    } catch {
      /* The session remains in memory until the tab closes. */
    }
  }
  function endSession() {
    clearSession()
    setSignedOut(true)
    setSessionId("")
    apiLogout()
    const empty = emptyState()
    stateRef.current = empty
    setState(empty)
  }
  function sendWorkflow(command: WorkflowCommand) {
    if (signedOut)
      return {
        ok: false,
        error: "Your session has ended. Sign in again to continue.",
      }
    if (apiEnabled) return { ok: false, error: API_READ_ONLY_MESSAGE }
    try {
      const next = applyWorkflow(stateRef.current, actor.id, command)
      stateRef.current = next
      setState(next)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
  }
  function updateAccount(a: Account) {
    if (state.accounts.find((x) => x.id === a.id)?.status === "deactivated") {
      setToast("Deactivated personnel records are read-only until reactivated.")
      return
    }
    commit(
      (s) => ({
        ...s,
        accounts: s.accounts.map((x) => (x.id === a.id ? a : x)),
      }),
      "Account details updated",
      a.name,
    )
    setDialog({ kind: "account", id: a.id })
  }
  function saveAccount(a: Account, pass?: string) {
    const exists = state.accounts.some((x) => x.id === a.id)
    commit(
      (s) => ({
        ...s,
        accounts: exists
          ? s.accounts.map((x) => (x.id === a.id ? a : x))
          : [...s.accounts, a],
      }),
      exists ? "Account details updated" : "New account created",
      `${a.name} · ${ROLE_NAMES[a.role]}`,
      "account",
      "Team",
    )
    setDialog(undefined)
    if (pass) setCredentials({ name: a.name, password: pass })
  }
  function addProject(p: Project) {
    // Backstop for the intake form: new projects need realistic dates based on today.
    const isNew = !state.projects.some((x) => x.id === p.id)
    if (isNew) {
      const dateErrs = projectDateErrors(p.start, p.end || "")
      if (dateErrs.start || dateErrs.end || !p.start || !p.end) return
    }
    commit(
      (s) => ({
        ...s,
        projects: s.projects.some((x) => x.id === p.id)
          ? s.projects.map((x) => (x.id === p.id ? p : x))
          : [...s.projects, p],
      }),
      "Project sent to Office PM",
      `${p.name} · ${nameFor(p.opmId)}`,
      "request",
      "Project intake",
    )
    navigate("Project intake")
    setDialog({ kind: "sent", id: p.id })
  }
  function updateCompany(c: Company, message: string) {
    commit(
      (s) => ({
        ...s,
        companies: s.companies.map((x) =>
          x.id === c.id ? { ...c, version: x.version + 1 } : x,
        ),
      }),
      message,
      c.name,
    )
  }
  function approval(c: Company, status: "approved" | "rejected") {
    setConfirmation({
      title:
        status === "approved"
          ? "Approve subcontractor?"
          : "Reject this request?",
      message: `${c.name} ${
        status === "approved"
          ? "will be added to the shared directory. Company approval does not record project acceptance."
          : "will not be added to the directory. Its request remains in history."
      }`,
      destructive: status === "rejected",
      action: () => {
        commit(
          (s) => {
            const current = s.companies.find((x) => x.id === c.id)
            if (
              current?.version !== c.version ||
              current.status !== "pending"
            ) {
              setToast("This request changed. Review the current status.")
              return s
            }
            return {
              ...s,
              companies: s.companies.map((x) =>
                x.id === c.id ? { ...x, status, version: x.version + 1 } : x,
              ),
            }
          },
          status === "approved"
            ? "Subcontractor request approved"
            : "Subcontractor request rejected",
          `${c.name} · ${projectFor(c.projectId)}`,
          status === "approved" ? "approval" : "request",
          "Approvals",
        )
      },
    })
  }
  function toggleStatus(a: Account) {
    const status = ["suspended", "deactivated"].includes(a.status)
      ? "active"
      : "suspended"
    if (a.id === admin.id) {
      setToast("The current Administrator cannot suspend their own session.")
      return
    }
    setConfirmation({
      title: `${status === "active" ? "Reactivate" : "Suspend"} account?`,
      message: `${a.name} ${
        status === "active"
          ? "will regain account access, subject to license rules."
          : "will no longer be eligible for sign-in or new assignments."
      }`,
      destructive: status === "suspended",
      action: () =>
        commit(
          (s) => ({
            ...s,
            accounts: s.accounts.map((x) =>
              x.id === a.id
                ? {
                    ...x,
                    status,
                    assignmentHold:
                      status === "active" ? false : x.assignmentHold,
                    suspendedAt: status === "suspended" ? today() : undefined,
                  }
                : x,
            ),
          }),
          status === "active" ? "Account reactivated" : "Account suspended",
          a.name,
        ),
    })
  }
  function startResignation(a: Account, letter: Doc, noticeDays: number) {
    if (signedOut || actor.role !== "admin")
      return "Reopen the Administrator session to continue."
    if (apiEnabled) return API_READ_ONLY_MESSAGE
    try {
      const next = beginAccountResignation(
        stateRef.current,
        actor.id,
        a.id,
        letter,
        noticeDays,
      )
      stateRef.current = next
      setState(next)
      setToast(
        noticeDays === 0
          ? "Employee account deactivated"
          : "Assignment Hold activated",
      )
      setDialog({ kind: "account", id: a.id })
    } catch (reason) {
      return (reason as Error).message
    }
  }
  function resolveSubconIssue(
    projectId: string,
    issueId: string,
    text: string,
  ) {
    if (signedOut || actor.role !== "admin") return "Sign in again to continue."
    if (apiEnabled) return API_READ_ONLY_MESSAGE
    try {
      const next = resolveClientSubconIssue(
        stateRef.current,
        actor.id,
        projectId,
        issueId,
        text,
      )
      stateRef.current = next
      setState(next)
      setToast("Issue resolved. Lead Site PM can continue.")
    } catch (error) {
      return (error as Error).message
    }
  }
  function previewDoc(d: Doc) {
    setPreview(d)
    commit((s) => s, "Document viewed", d.label, "view")
  }
  function addAccountDoc(a: Account, d: Doc) {
    updateAccount({ ...a, docs: [...a.docs, d] })
  }
  function addEngagement(p: Project, a: Account, d: Doc) {
    commit(
      (s) => ({
        ...s,
        projects: s.projects.map((x) =>
          x.id === p.id
            ? {
                ...x,
                docs: [
                  ...x.docs,
                  {
                    ...d,
                    subjectId: a.id,
                    label: `${a.name} — Engagement Agreement`,
                  },
                ],
              }
            : x,
        ),
      }),
      "Engagement agreement uploaded",
      `${p.name} · ${a.name}`,
      "account",
      "Project documents",
    )
  }
  function reassign(p: Project, phase: string, accountId: string) {
    const row = p.team.find((t) => t.phase === phase)
    if (
      !row ||
      row.status === "confirmed" ||
      !spmCandidates(state, p.type, phase, p.id).some(
        (c) => c.account.id === accountId,
      )
    )
      return
    commit(
      (s) => ({
        ...s,
        projects: s.projects.map((x) =>
          x.id === p.id
            ? {
                ...x,
                team: x.team.map((t) =>
                  t.phase === phase
                    ? { ...t, accountId, status: "pending" }
                    : t,
                ),
              }
            : x,
        ),
      }),
      "Phase assignment updated",
      `${p.name} · ${phase} · ${nameFor(accountId)}`,
      "request",
      "Project intake",
    )
  }
  const matches = (value: string) =>
    value.toLowerCase().includes(query.toLowerCase())
  const filteredProjects = state.projects.filter(
    (p) =>
      matches(`${p.name} ${p.type} ${nameFor(p.opmId)}`) &&
      (filter === "all" || p.status === filter),
  )
  const visibleEngineers = engineers.filter(
    (a) =>
      matches(`${a.name} ${a.email} ${a.scope.join(" ")} ${a.license}`) &&
      (roleFilter === "all" || a.role === roleFilter) &&
      (filter === "all" || a.status === filter) &&
      (licenseFilter === "all" ||
        licenseState(a, state.rules.grace) === licenseFilter),
  )
  const visibleCompanies = state.companies.filter(
    (c) =>
      c.status === "approved" &&
      matches(`${c.name} ${c.contact} ${c.email}`) &&
      (filter === "all" ||
        (filter === "busy"
          ? c.availability === "committed"
          : c.availability === "available")),
  )

  function projectTable(projects: Project[], intakeTable = false) {
    return projects.length ? (
      <div className="table-scroll">
        <table className="project-table">
          <thead>
            <tr>
              <th>PROJECT NAME</th>
              <th>{intakeTable ? "ASSIGNED OFFICE PM" : "CURRENT PHASE"}</th>
              <th>{intakeTable ? "CONFIRMATIONS" : "PROGRESS"}</th>
              {!intakeTable && <th>PLANNED TIMELINE</th>}
              <th>STATUS</th>
              <th className="right">{intakeTable ? "ACTION" : "SITE LEAD"}</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p, i) => (
              <tr key={p.id}>
                <td>
                  <button
                    className="project-name"
                    onClick={() => setDialog({ kind: "project", id: p.id })}
                  >
                    <span className={`project-symbol symbol-${i % 3}`}>
                      <Icon name="building" size={21} />
                    </span>
                    <span>
                      <strong>{p.name}</strong>
                      <small>
                        {p.type} <span className="mid-dot">·</span> SL-
                        {p.id.replace(/\D/g, "").padStart(3, "0")}
                      </small>
                    </span>
                  </button>
                </td>
                <td>
                  {intakeTable ? (
                    <div className="person-cell">
                      <span className="avatar small">
                        {initials(nameFor(p.opmId))}
                      </span>
                      <span>{nameFor(p.opmId)}</span>
                    </div>
                  ) : (
                    <span className="phase-label">{p.phase}</span>
                  )}
                </td>
                <td>
                  {intakeTable ? (
                    <div className="confirmation-progress">
                      <span>
                        {p.opmAccepted
                          ? "Office PM accepted"
                          : "Office PM pending"}
                      </span>
                      <small>
                        {p.team.filter((t) => t.status === "confirmed").length}/
                        {p.team.length} Site PM phases confirmed
                      </small>
                    </div>
                  ) : (
                    <div className="progress-cell">
                      <progress max="100" value={p.progress} />
                      <strong>{p.progress}%</strong>
                    </div>
                  )}
                </td>
                {!intakeTable && (
                  <td>
                    <PlannedTimeline project={p} compact />
                  </td>
                )}
                <td>
                  <Status
                    status={
                      p.status === "pending" && p.opmAccepted
                        ? !registeredComplete(p)
                          ? "Office PM documents pending"
                          : !teamConfirmed(p)
                            ? "Site PM responses pending"
                            : "Subcontractor coordination"
                        : p.status
                    }
                  />
                </td>
                <td className="right">
                  {intakeTable ? (
                    <Button
                      variant="text-button"
                      onClick={() =>
                        setDialog({
                          kind:
                            p.status === "changes_requested" ||
                            p.status === "draft"
                              ? "intake"
                              : "project",
                          id: p.id,
                        })
                      }
                    >
                      {p.status === "changes_requested"
                        ? "Resubmit"
                        : "View details"}
                      <Icon name="arrow" size={16} />
                    </Button>
                  ) : (
                    <div className="lead-cell">
                      <span className="avatar small">
                        {initials(nameFor(p.team[0]?.accountId))}
                      </span>
                      <span>
                        {nameFor(p.team[0]?.accountId)
                          .split(" ")
                          .filter((x) => x.length > 2)
                          .slice(0, 2)
                          .join(" ")}
                      </span>
                      <button
                        className="row-arrow"
                        aria-label={`View ${p.name}`}
                        onClick={() => setDialog({ kind: "project", id: p.id })}
                      >
                        <Icon name="chevron" size={17} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <Empty title="No projects found">
        Try another search or create a new project intake.
      </Empty>
    )
  }
  function subconRequests(status: string) {
    return (
      <div className="approvals-grid">
        {state.companies
          .filter((c) => c.status === status)
          .map((c) => (
            <Panel
              key={c.id}
              title={c.name}
              subtitle="Project-level subcontractor"
              actions={<Status status={c.status} />}
            >
              <div className="approval-content">
                <div className="detail-grid">
                  <div>
                    <small>SUBMITTED BY</small>
                    <strong>{c.submittedBy || "Directory record"}</strong>
                  </div>
                  <div>
                    <small>PROJECT</small>
                    <strong>{projectFor(c.projectId)}</strong>
                  </div>
                  <div>
                    <small>CONTACT PERSON</small>
                    <strong>{c.contact}</strong>
                  </div>
                  <div>
                    <small>CONTACT NUMBER</small>
                    <strong>{c.phone}</strong>
                  </div>
                </div>
                <p>{c.note}</p>
                <Button
                  variant="text-button"
                  icon="doc"
                  onClick={() => setDialog({ kind: "company", id: c.id })}
                >
                  View company & supporting documents
                </Button>
                {c.status === "pending" && (
                  <div className="approval-actions">
                    <Button
                      variant="primary"
                      icon="check"
                      onClick={() => approval(c, "approved")}
                    >
                      Approve company
                    </Button>
                    <Button
                      variant="danger-ghost"
                      onClick={() => approval(c, "rejected")}
                    >
                      Reject request
                    </Button>
                  </div>
                )}
              </div>
            </Panel>
          ))}
        {!state.companies.some((c) => c.status === status) && (
          <Empty title="No requests in this category" />
        )}
      </div>
    )
  }
  function activityList(events: Event[], compact = false) {
    return (
      <div className={`activity-list ${compact ? "compact-activity" : ""}`}>
        {events.length ? (
          events.map((e) => (
            <button
              className={`activity-item ${!e.read ? "unread" : ""}`}
              key={e.id}
              onClick={() => {
                setState((s) => ({
                  ...s,
                  events: s.events.map((x) =>
                    x.id === e.id ? { ...x, read: true } : x,
                  ),
                }))
                if (e.target === "Approvals") {
                  openPendingRequests()
                  setDialog(undefined)
                } else if (
                  NAV.some((n) => n.label === e.target) ||
                  resolveAdminTarget(e.target)
                ) {
                  navigate(e.target)
                  setDialog(undefined)
                } else if (e.projectId) {
                  setNotifications(false)
                  setDialog({ kind: "project", id: e.projectId })
                } else setDialog(undefined)
              }}
            >
              <span className={`activity-icon ${e.type}`}>
                <Icon
                  name={
                    e.type === "approval"
                      ? "check"
                      : e.type === "request"
                        ? "clock"
                        : e.type === "progress"
                          ? "trend"
                          : "doc"
                  }
                  size={16}
                />
              </span>
              <span className="activity-copy">
                <strong>{e.title}</strong>
                <small>{e.detail}</small>
                <span className="activity-time">
                  {new Date(e.date).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}{" "}
                  · {dateLabel(e.date)}
                </span>
              </span>
              {!e.read && <i className="unread-dot" />}
            </button>
          ))
        ) : (
          <Empty title="You're all caught up" />
        )}
      </div>
    )
  }
  function dashboard() {
    const totalCurrent = state.projects.filter(
      (p) => !["completed", "declined", "expired"].includes(p.status),
    ).length
    return (
      <>
        <div className="page-heading">
          <div>
            <div className="eyebrow">YOUR OPERATIONS, AT A GLANCE</div>
            <h1>
              Workspace overview<span className="heading-dot">.</span>
            </h1>
            <p>
              A clear view of your projects, people, and what needs your
              attention.
            </p>
          </div>
          <Button
            variant="primary"
            icon="plus"
            onClick={() => setDialog({ kind: "intake" })}
          >
            New project intake
          </Button>
        </div>
        <div className="metrics-grid">
          {[
            {
              title: "Active projects",
              value: active.length,
              note: `${totalCurrent} projects in your pipeline`,
              icon: "building",
              target: "Active sites",
              label: "View projects",
            },
            {
              title: "Pending confirmations",
              value: intake.filter((p) => !p.opmAccepted).length,
              note: "Awaiting Office PM response",
              icon: "clock",
              target: "Project intake",
              label: "Review intake",
            },
            {
              title: "Team members",
              value: state.accounts.filter((a) =>
                ["active", "invited"].includes(a.status),
              ).length,
              note: `${engineers.filter((a) => a.status === "active").length} active in-house personnel`,
              icon: "users",
              target: "Team",
              label: "Manage team",
            },
            {
              title: "Pending approvals",
              value: pending.length,
              note: "New subcontractor requests",
              icon: "shield",
              target: "Approvals",
              label: "Review requests",
            },
          ].map((m) => (
            <button
              className="metric-card"
              key={m.title}
              onClick={() => openTarget(m.target)}
            >
              <div className="metric-top">
                <span>{m.title}</span>
                <span className="metric-icon">
                  <Icon name={m.icon} />
                </span>
              </div>
              <div className="metric-value">
                {m.value.toString().padStart(2, "0")}
              </div>
              <div className="metric-bottom">
                <span>{m.note}</span>
                <Icon name="arrow" size={16} />
              </div>
            </button>
          ))}
        </div>
        {(pending.length > 0 || licenseAlerts.length > 0) && (
          <div className="attention-strip">
            <span className="attention-icon">
              <Icon name="alert" size={20} />
            </span>
            <div>
              <strong>A little attention goes a long way.</strong>
              <span>
                {pending.length} subcontractor{" "}
                {pending.length === 1 ? "request needs" : "requests need"}{" "}
                approval
                {licenseAlerts.length > 0
                  ? ` and ${licenseAlerts.length} engineer license${
                      licenseAlerts.length > 1 ? "s need" : " needs"
                    } review`
                  : ""}
                .
              </span>
            </div>
            <Button
              variant="text-button"
              onClick={() =>
                pending.length
                  ? openPendingRequests()
                  : navigate("Engineer directory")
              }
            >
              Review items
              <Icon name="arrow" size={16} />
            </Button>
          </div>
        )}
        <div className="dashboard-main-grid">
          <Panel
            title="Active sites"
            subtitle="Keep every project moving in the right direction."
            actions={
              <Button
                variant="text-button"
                onClick={() => navigate("Active sites")}
              >
                View all projects
                <Icon name="arrow" size={16} />
              </Button>
            }
          >
            {projectTable(active)}
            <div className="panel-foot">
              <span>
                <i className="status-dot green" />
                Live workspace data
              </span>
              <span>{active.length} active projects</span>
            </div>
          </Panel>
          <Panel
            title="Intake pipeline"
            subtitle="From first details to ready for site."
            actions={<Icon name="activity" size={18} />}
            className="pipeline-panel"
          >
            <div className="pipeline-total">
              <strong>{intake.length.toString().padStart(2, "0")}</strong>
              <span>projects in intake</span>
              <span className="pipeline-badge">In progress</span>
            </div>
            <div className="pipeline-stages">
              {[
                {
                  label: "Awaiting Office PM",
                  count: intake.filter(
                    (p) => p.status === "pending" && !p.opmAccepted,
                  ).length,
                  tone: "green",
                },
                {
                  label: "Site PM confirmation",
                  count: intake.filter(
                    (p) =>
                      p.opmAccepted &&
                      p.team.some((t) => t.status !== "confirmed"),
                  ).length,
                  tone: "sage",
                },
                {
                  label: "Changes requested",
                  count: intake.filter((p) => p.status === "changes_requested")
                    .length,
                  tone: "amber",
                },
                {
                  label: "Draft projects",
                  count: intake.filter((p) => p.status === "draft").length,
                  tone: "gray",
                },
              ].map((s) => (
                <button
                  key={s.label}
                  onClick={() => {
                    navigate("Project intake")
                    if (s.tone === "amber") setFilter("changes_requested")
                  }}
                >
                  <span>
                    <i className={`status-dot ${s.tone}`} />
                    {s.label}
                  </span>
                  <b>{s.count.toString().padStart(2, "0")}</b>
                </button>
              ))}
            </div>
            <Button
              className="full-width"
              onClick={() => navigate("Project intake")}
            >
              Open intake log
              <Icon name="arrow" size={16} />
            </Button>
          </Panel>
        </div>
        <div className="dashboard-bottom-grid">
          <Panel
            title="Schedule performance"
            subtitle="Recorded project completion and progress history."
            actions={
              <Button
                variant="text-button"
                onClick={() => navigate("Schedule performance")}
              >
                View report
                <Icon name="arrow" size={16} />
              </Button>
            }
          >
            <Chart compact projects={active} />
          </Panel>
          <Panel
            title="Recent activity"
            subtitle="The latest across your workspace."
            actions={
              <Button
                variant="text-button"
                onClick={() => setDialog({ kind: "activity" })}
              >
                View all
                <Icon name="arrow" size={16} />
              </Button>
            }
          >
            {activityList(state.events.slice(0, 4), true)}
          </Panel>
        </div>
        <div className="workspace-footer">
          <span>
            SITELINE <span>Built for the work ahead.</span>
          </span>
          <span>
            <i className="status-dot green" />
            Administrator workspace
          </span>
        </div>
      </>
    )
  }
  function pageHeading(title: string, subtitle: string, action?: ReactNode) {
    return (
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {["Team", "Settings", "Archive"].includes(page)
              ? "ORGANIZATION"
              : "CONSTRUCTION OPERATIONS"}
          </div>
          <h1>
            {title}
            <span className="heading-dot">.</span>
          </h1>
          <p>{subtitle}</p>
        </div>
        {action}
      </div>
    )
  }
  function renderPage() {
    if (page === "Dashboard") return dashboard()
    if (page === "Active sites")
      return (
        <>
          {pageHeading(
            "Active sites",
            "Project visibility from mobilization through closeout.",
          )}
          <div className="summary-pills">
            <span>
              <b>{active.length}</b> Active projects
            </span>
            <span>
              <b>
                {
                  new Set(active.flatMap((p) => p.team.map((t) => t.accountId)))
                    .size
                }
              </b>{" "}
              Site leads
            </span>
            <span>
              <b>
                {active.length
                  ? Math.round(
                      active.reduce((n, p) => n + p.progress, 0) /
                        active.length,
                    )
                  : 0}
                %
              </b>{" "}
              Average progress
            </span>
          </div>
          <Panel
            title="Project monitoring"
            actions={
              <Search
                value={query}
                onChange={setQuery}
                placeholder="Search projects or personnel"
              />
            }
          >
            {projectTable(
              filteredProjects.filter((p) => p.status === "active"),
            )}
          </Panel>
        </>
      )
    if (page === "Project intake")
      return (
        <>
          {pageHeading(
            "Project intake",
            "Plan the project. Find the right people. Set work in motion.",
            <Button
              variant="primary"
              icon="plus"
              onClick={() => setDialog({ kind: "intake" })}
            >
              New project intake
            </Button>,
          )}
          <div className="notice">
            <Icon name="shield" />
            <p>
              Intake handoff: Administrator → Office PM acceptance → six
              required documents → Lead and Site PM acceptance → subcontractor
              coordination → activation. Admin cannot accept on behalf of
              another role.
            </p>
          </div>
          <Panel
            title="Project intake log"
            subtitle={`${intake.length} current intake records`}
            actions={
              <Search
                value={query}
                onChange={setQuery}
                placeholder="Search intake records"
              />
            }
          >
            <div className="tabs">
              {[
                ["all", "All intake"],
                ["pending", "Awaiting confirmation"],
                ["changes_requested", "Changes requested"],
                ["draft", "Drafts"],
              ].map(([value, label]) => (
                <button
                  className={filter === value ? "active" : ""}
                  key={value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            {projectTable(
              filteredProjects.filter((p) =>
                ["pending", "changes_requested", "draft"].includes(p.status),
              ),
              true,
            )}
          </Panel>
        </>
      )
    if (page === "Schedule performance")
      return (
        <>
          {pageHeading(
            "Schedule performance",
            "Recorded completion and progress history across projects.",
          )}
          <div className="notice">
            <Icon name="activity" />
            <p>
              Completion percentages and history come from project records.
              Planned-versus-actual comparisons will appear when a saved
              schedule baseline is available.
            </p>
          </div>
          <Panel
            title="Portfolio schedule"
            subtitle={`${active.length} active projects · recorded completion`}
          >
            <Chart projects={active} />
          </Panel>
          <div className="schedule-cards">
            {active.map((p) => (
              <Panel
                key={p.id}
                title={p.name}
                subtitle={`${p.phase} · ${p.progress}% actual recorded completion`}
                actions={
                  <Button
                    variant="icon-button"
                    aria-label={`View ${p.name}`}
                    icon="arrow"
                    onClick={() => setDialog({ kind: "project", id: p.id })}
                  />
                }
              >
                <div className="schedule-timeline">
                  <PlannedTimeline project={p} />
                </div>
                <Chart compact projects={[p]} />
              </Panel>
            ))}
          </div>
        </>
      )
    const projectDocumentsTab = () => (
        <>
          <DocumentRepository
            projects={state.projects.map((project) => ({
              id: project.id,
              name: project.name,
              subtitle: `${project.type} · ${project.phase}`,
              categories: staffRepositoryCategories(
                projectDocumentIndex(project),
              ),
            }))}
            onOpen={(projectId, fileId) => {
              const project = state.projects.find((p) => p.id === projectId)
              const doc =
                project && findIndexedDoc(projectDocumentIndex(project), fileId)
              if (doc) previewDoc(doc)
            }}
          />
        </>
      )
    const engineerDocumentsTab = () => (
        <>
          <Panel
            title="Personnel document repository"
            actions={
              <Search
                value={query}
                onChange={setQuery}
                placeholder="Search engineer name or license"
              />
            }
          >
            <div className="folder-grid">
              {visibleEngineers.map((a) => (
                <button
                  className="folder-card"
                  key={a.id}
                  onClick={() => setDialog({ kind: "engineer-docs", id: a.id })}
                >
                  <span className="avatar large">{initials(a.name)}</span>
                  <Status status={licenseState(a, state.rules.grace)} />
                  <h3>{a.name}</h3>
                  <p>{ROLE_NAMES[a.role]}</p>
                  <div>
                    <span>{a.docs.length} documents on file</span>
                    <Icon name="arrow" size={17} />
                  </div>
                </button>
              ))}
            </div>
            {!visibleEngineers.length && (
              <Empty title="No personnel match your search" />
            )}
          </Panel>
        </>
      )
    const engineersTab = () => (
        <>
          <Panel
            title="In-house personnel"
            subtitle={`${engineers.length} engineers and administrators`}
            actions={
              <Search
                value={query}
                onChange={setQuery}
                placeholder="Search name, discipline or license"
              />
            }
          >
            <div className="filter-bar">
              <select
                aria-label="Filter engineer role"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="all">All roles</option>
                <option value="admin">Administrator</option>
                <option value="opm">Office PM</option>
                <option value="spm">Site PM</option>
              </select>
              <select
                aria-label="Filter account status"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">All account statuses</option>
                <option value="active">Active</option>
                <option value="invited">Invited</option>
                <option value="suspended">Suspended</option>
                <option value="deactivated">Deactivated</option>
              </select>
              <select
                aria-label="Filter license status"
                value={licenseFilter}
                onChange={(e) => setLicenseFilter(e.target.value)}
              >
                <option value="all">All license statuses</option>
                {[
                  "Valid",
                  "Renewed",
                  "Expiring soon",
                  "Expired",
                  "Grace expired",
                  "Not on file",
                ].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="engineer-grid">
              {visibleEngineers.map((a) => (
                <button
                  className="engineer-card"
                  key={a.id}
                  onClick={() => setDialog({ kind: "account", id: a.id })}
                >
                  <div className="engineer-top">
                    <span className="avatar large">{initials(a.name)}</span>
                    <Status status={a.status} />
                  </div>
                  <h3>{a.name}</h3>
                  <p>{ROLE_NAMES[a.role]}</p>
                  <div className="tag-list">
                    {(a.scope.length && a.role === "spm"
                      ? a.scope
                      : a.projectTypes.length
                        ? a.projectTypes
                        : ["Organization"]
                    ).map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                  <div className="engineer-footer">
                    <span>
                      {workload(state, a.id)} / {state.rules.cap} active
                      projects
                    </span>
                    <Status status={licenseState(a, state.rules.grace)} />
                  </div>
                </button>
              ))}
            </div>
            {!visibleEngineers.length && (
              <Empty title="No matching personnel" />
            )}
          </Panel>
        </>
      )
    const subcontractorsTab = () => (
        <>
          <div className="tabs standalone">
            {[
              ["registered", "Registered companies"],
              ["pending", `Pending requests (${pending.length})`],
              ["rejected", "Rejected"],
              ["archived", "Archived"],
            ].map(([v, l]) => (
              <button
                key={v}
                className={subconTab === v ? "active" : ""}
                onClick={() => setSubconTab(v)}
              >
                {l}
              </button>
            ))}
          </div>
          {subconTab !== "registered" && subconRequests(subconTab)}
          {subconTab === "registered" && (
            <Panel
              title="Registered companies"
              subtitle={`${state.companies.filter((c) => c.status === "approved").length} approved subcontractors`}
              actions={
                <Search
                  value={query}
                  onChange={setQuery}
                  placeholder="Search company"
                />
              }
            >
              <div className="filter-bar">
                <select
                  aria-label="Company availability"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">All availability</option>
                  <option value="available">Available</option>
                  <option value="busy">Fully committed</option>
                </select>
                <span>
                  Assignments remain project-level and are not managed here.
                </span>
              </div>
              <div className="company-grid">
                {visibleCompanies.map((c) => {
                  const projects = c.activeProjectIds.filter((projectId) =>
                    state.projects.some(
                      (project) =>
                        project.id === projectId && project.status === "active",
                    ),
                  )
                  return (
                    <button
                      key={c.id}
                      className="company-card"
                      onClick={() => setDialog({ kind: "company", id: c.id })}
                    >
                      <div className="company-top">
                        <span className="company-monogram">
                          {initials(c.name)}
                        </span>
                        <Badge
                          tone={
                            c.availability === "available" ? "green" : "amber"
                          }
                        >
                          {c.availability}
                        </Badge>
                      </div>
                      <h3>{c.name}</h3>
                      <p>{c.email || "Company email not supplied"}</p>
                      <div className="company-meta">
                        <span>
                          <Icon name="users" size={16} />
                          {c.manpowerCount} available manpower
                        </span>
                        <span>
                          <Icon name="building" size={16} />
                          {projects.length} active project commitments
                        </span>
                      </div>
                      <div className="coverage">
                        <span>
                          Manpower list documents
                          <strong>{c.manpowerDocuments.length}</strong>
                        </span>
                      </div>
                      <div className="card-bottom">
                        <span>View company details</span>
                        <Icon name="arrow" size={17} />
                      </div>
                    </button>
                  )
                })}
              </div>
              {!visibleCompanies.length && (
                <Empty title="No companies match these filters" />
              )}
            </Panel>
          )}
        </>
      )
    // Documents and Directory: one sidebar item each, existing pages as tab contents.
    const pageTabs = <T extends string>(
      label: string,
      items: [T, string][],
      active: T,
      select: (tab: T) => void,
    ) => (
      <div className="tabs standalone" role="tablist" aria-label={label}>
        {items.map(([id, text], index) => (
          <button
            key={id}
            role="tab"
            data-tab={id}
            aria-selected={active === id}
            tabIndex={active === id ? 0 : -1}
            className={active === id ? "active" : ""}
            onClick={() => select(id)}
            onKeyDown={(e) => {
              const step =
                e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0
              if (!step) return
              e.preventDefault()
              const list = e.currentTarget.parentElement
              const nextId = items[(index + step + items.length) % items.length][0]
              select(nextId)
              ;(
                list?.querySelector(
                  `[role="tab"][data-tab="${nextId}"]`,
                ) as HTMLElement | null
              )?.focus()
            }}
          >
            {text}
          </button>
        ))}
      </div>
    )
    if (page === "Documents")
      return (
        <>
          {pageHeading(
            "Documents",
            "Project records and engineer credentials in one place.",
          )}
          {pageTabs(
            "Documents sections",
            DOCUMENT_TABS,
            documentsTab,
            selectDocumentsTab,
          )}
          <div role="tabpanel">
            {documentsTab === "project"
              ? projectDocumentsTab()
              : engineerDocumentsTab()}
          </div>
        </>
      )
    if (page === "Directory")
      return (
        <>
          {pageHeading(
            "Directory",
            "Your engineers and verified subcontractor companies.",
            directoryTab === "subcontractors" ? (
              <Button
                variant="primary"
                icon="plus"
                onClick={() => setDialog({ kind: "add-company" })}
              >
                Add Company
              </Button>
            ) : undefined,
          )}
          {pageTabs(
            "Directory sections",
            DIRECTORY_TABS,
            directoryTab,
            selectDirectoryTab,
          )}
          <div role="tabpanel">
            {directoryTab === "engineers"
              ? engineersTab()
              : subcontractorsTab()}
          </div>
        </>
      )
    if (page === "Team")
      return (
        <>
          {pageHeading(
            "Team & accounts",
            "Manage access, responsibilities, and the people in your organization.",
            <Button
              variant="primary"
              icon="plus"
              onClick={() => setDialog({ kind: "add-account" })}
            >
              Add account
            </Button>,
          )}
          <Panel
            title="Organization accounts"
            subtitle={`${state.accounts.filter((a) => a.status !== "deactivated").length} accounts · Admin-provisioned access`}
            actions={
              <Search
                value={query}
                onChange={setQuery}
                placeholder="Search name, scope or status"
              />
            }
          >
            <div className="tabs">
              {[["all", "All accounts"], ...Object.entries(ROLE_NAMES)].map(
                ([role, name]) => (
                  <button
                    key={role}
                    className={roleFilter === role ? "active" : ""}
                    onClick={() => setRoleFilter(role)}
                  >
                    {name}
                  </button>
                ),
              )}
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>PERSON</th>
                    <th>ROLE</th>
                    <th>SCOPE / SPECIALIZATION</th>
                    <th>STATUS</th>
                    <th>ADDED</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {state.accounts
                    .filter(
                      (a) =>
                        a.status !== "deactivated" &&
                        (roleFilter === "all" || a.role === roleFilter) &&
                        matches(
                          `${a.name} ${a.email} ${a.scope.join(" ")} ${a.status}`,
                        ),
                    )
                    .map((a) => (
                      <tr key={a.id}>
                        <td>
                          <button
                            className="person-cell clickable"
                            onClick={() =>
                              setDialog({ kind: "account", id: a.id })
                            }
                          >
                            <span className="avatar">{initials(a.name)}</span>
                            <span>
                              <strong>{a.name}</strong>
                              <small>{a.email}</small>
                            </span>
                          </button>
                        </td>
                        <td>{ROLE_NAMES[a.role]}</td>
                        <td>
                          <div className="tag-list">
                            {(a.role === "client"
                              ? a.scope.map(projectFor)
                              : a.scope.length
                                ? a.scope
                                : a.projectTypes
                            ).map((t) => (
                              <span key={t}>{t}</span>
                            ))}
                            {a.role === "admin" && (
                              <span>Organization-wide</span>
                            )}
                          </div>
                          {a.cooldown && a.cooldown > Date.now() && (
                            <Badge tone="amber">24h cooldown</Badge>
                          )}
                          {a.assignmentHold && (
                            <Badge tone="amber">Assignment Hold</Badge>
                          )}
                        </td>
                        <td>
                          <Status status={a.status} />
                        </td>
                        <td>{dateLabel(a.added)}</td>
                        <td>
                          <Button
                            variant="icon-button"
                            icon="chevron"
                            aria-label={`View ${a.name}`}
                            onClick={() =>
                              setDialog({ kind: "account", id: a.id })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )
    if (page === "Archive") {
      const archived = state.projects.filter((p) =>
        tab === "closed"
          ? p.status === "completed"
          : tab === "expired"
            ? p.status === "expired"
            : p.status === "declined",
      )
      const suspended = state.accounts.filter(
        (a) =>
          a.status === "suspended" &&
          a.suspendedAt &&
          (Date.now() - new Date(a.suspendedAt).getTime()) / 86400000 >=
            archiveDays,
      )
      const deactivated = state.accounts.filter(
        (a) => a.status === "deactivated",
      )
      return (
        <>
          {pageHeading(
            "Archive",
            "Keep completed work and resolved records within reach.",
          )}
          <div className="notice">
            <Icon name="archive" />
            <p>
              Historical records are read-only. The source does not implement
              automatic archive transfers; this workspace does not invent
              project-completion or retention automation.
            </p>
          </div>
          <Panel title="Historical records">
            <div className="tabs">
              {[
                ["closed", "Closed projects"],
                ["declined", "Declined intake"],
                ["expired", "Expired assignments"],
                ["accounts", "Offboarded accounts"],
              ].map(([v, l]) => (
                <button
                  key={v}
                  className={tab === v ? "active" : ""}
                  onClick={() => setTab(v)}
                >
                  {l}
                </button>
              ))}
            </div>
            {tab === "accounts" ? (
              <div className="archive-accounts">
                <div className="filter-bar">
                  <span>Flag inactive employee accounts for review after</span>
                  <select
                    value={archiveDays}
                    aria-label="Inactive account review threshold"
                    onChange={(e) => setArchiveDays(Number(e.target.value))}
                  >
                    {[30, 60, 90].map((d) => (
                      <option value={d} key={d}>
                        {d} days
                      </option>
                    ))}
                  </select>
                </div>
                {suspended.map((a) => (
                  <div key={a.id} className="archive-account">
                    <span className="avatar">{initials(a.name)}</span>
                    <div>
                      <strong>{a.name}</strong>
                      <p>
                        {ROLE_NAMES[a.role]} · Inactive since{" "}
                        {dateLabel(a.suspendedAt!)}
                      </p>
                    </div>
                    <Button onClick={() => toggleStatus(a)}>Reinstate</Button>
                    <Button
                      variant="danger-ghost"
                      onClick={() =>
                        setConfirmation({
                          title: "Deactivate account?",
                          message: `${a.name} will be deactivated. Personnel records, documents, and project relationships will remain available in history.`,
                          destructive: true,
                          action: () =>
                            commit(
                              (s) => ({
                                ...s,
                                accounts: s.accounts.map((x) =>
                                  x.id === a.id
                                    ? {
                                        ...x,
                                        status: "deactivated",
                                        suspendedAt: x.suspendedAt || today(),
                                      }
                                    : x,
                                ),
                              }),
                              "Account deactivated and archived",
                              a.name,
                            ),
                        })
                      }
                    >
                      Deactivate account
                    </Button>
                  </div>
                ))}
                <h3>Deactivated accounts</h3>
                {deactivated.map((a) => (
                  <div className="archive-account" key={a.id}>
                    <strong>{a.name}</strong>
                    <span>{ROLE_NAMES[a.role]}</span>
                    <Status status={a.status} />
                    <Button
                      onClick={() => setDialog({ kind: "account", id: a.id })}
                    >
                      View record
                    </Button>
                  </div>
                ))}
                {!suspended.length && !deactivated.length && (
                  <Empty title="No accounts require review" />
                )}
              </div>
            ) : (
              projectTable(archived)
            )}
          </Panel>
        </>
      )
    }
    if (page === "Settings")
      return (
        <>
          {pageHeading(
            "Organization settings",
            "Clear rules for a consistent, accountable operation.",
          )}
          <div className="notice">
            <Icon name="shield" />
            <p>
              Administrator-only rules. Each change requires confirmation and
              immediately updates related eligibility checks.
            </p>
          </div>
          <Panel
            title="Organization rules"
            subtitle="Applies across all projects and personnel"
          >
            <SettingsForm
              rules={state.rules}
              onSave={(rules, label) =>
                commit(
                  (s) => ({ ...s, rules }),
                  "Organization rule updated",
                  label,
                  "system",
                  "Settings",
                )
              }
            />
          </Panel>
          <Panel
            title="Notification preferences"
            subtitle="Choose the updates that appear in your notification inbox."
          >
            <div className="notification-settings">
              {["request", "approval", "progress", "notice"].map((type) => (
                <label className="preference-row" key={type}>
                  <span>
                    <strong>
                      {type[0].toUpperCase() + type.slice(1)} updates
                    </strong>
                    <small>
                      Activity history is retained even when notifications are
                      muted.
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={!state.muted.includes(type)}
                    onChange={() =>
                      setState((s) => ({
                        ...s,
                        muted: s.muted.includes(type)
                          ? s.muted.filter((t) => t !== type)
                          : [...s.muted, type],
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          </Panel>
          <Panel title="Workspace account">
            <div className="account-settings">
              <span className="avatar large">{initials(admin.name)}</span>
              <div>
                <h3>{admin.name}</h3>
                <p>{admin.email} · Administrator</p>
              </div>
              <Button
                onClick={() =>
                  setDialog({ kind: "edit-account", id: admin.id })
                }
              >
                Edit account
              </Button>
            </div>
            <div className="notice neutral">
              <Icon name="doc" />
              <p>
                Accounts and records are stored in this browser. Account access
                and password changes are managed by the Administrator. No public
                sharing is enabled.
              </p>
            </div>
          </Panel>
        </>
      )
    return null
  }
  function projectDetails(p: Project, docsOnly = false) {
    const phases = projectPhaseNames(p)
    const currentPhaseIndex = phases.indexOf(p.phase)
    const staff = [...new Set([p.opmId, ...p.team.map((t) => t.accountId)])]
      .map((id) => state.accounts.find((a) => a.id === id))
      .filter(Boolean) as Account[]
    return (
      <>
        <div className="detail-hero">
          <span className="project-symbol">
            <Icon name="building" size={28} />
          </span>
          <div>
            <span className="eyebrow">
              {p.type} · SL-{p.id.replace(/\D/g, "").padStart(3, "0")}
            </span>
            <h3>{p.name}</h3>
            <p>{p.location || "Project location not specified"}</p>
          </div>
          <Status status={p.status} />
        </div>
        {!docsOnly && (
          <>
            <div className="detail-stats">
              <div>
                <small>OVERALL PROGRESS</small>
                <strong>{p.progress}%</strong>
              </div>
              <div>
                <small>CURRENT PHASE</small>
                <strong>{p.phase}</strong>
              </div>
              <div>
                <small>FLOOR AREA</small>
                <strong>{p.area} sqm</strong>
              </div>
              <div>
                <small>TARGET START</small>
                <strong>{dateLabel(p.start)}</strong>
              </div>
              <div>
                <small>TARGET END</small>
                <strong>{p.end ? dateLabel(p.end) : "Not set"}</strong>
              </div>
            </div>
            <PlannedTimeline project={p} />
            <div className="phase-timeline">
              {phases.map((phase, i) => (
                <div
                  className={
                    i < currentPhaseIndex
                      ? "done"
                      : p.phase === phase
                        ? "current"
                        : ""
                  }
                  key={phase}
                >
                  <span>
                    {i < currentPhaseIndex ? (
                      <Icon name="check" size={15} />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <strong>{phase}</strong>
                </div>
              ))}
            </div>
            {p.status !== "active" && p.status !== "completed" && (
              <div className="notice">
                <Icon name="clock" />
                <p>
                  {p.note ||
                    "Awaiting the assigned Office PM. Administrator submission does not accept assignments or activate client access."}{" "}
                  {p.docs.slice(0, 6).filter((d) => d.uploaded).length}/6 Office
                  PM documents uploaded.{" "}
                  {p.team.filter((t) => t.status === "confirmed").length}/
                  {p.team.length} phase assignments confirmed.
                </p>
              </div>
            )}
            <section className="detail-section">
              <h3>Personnel & phase assignments</h3>
              <div className="office-pm-row">
                <span className="avatar">{initials(nameFor(p.opmId))}</span>
                <div>
                  <strong>{nameFor(p.opmId)}</strong>
                  <p>
                    Office Project Manager ·{" "}
                    {p.opmAccepted ? "Accepted" : "Awaiting acceptance"}
                  </p>
                </div>
                <Button
                  onClick={() => setDialog({ kind: "account", id: p.opmId })}
                >
                  View profile
                </Button>
              </div>
              <div className="phase-assignments">
                {p.team.map((t) => (
                  <div key={t.phase}>
                    <span>
                      <strong>{t.phase}</strong>
                      <small>
                        {t.phase === "Mobilization"
                          ? `Lead Site PM · ${projectPhaseDisciplines(p, t.phase).join(", ")}`
                          : projectPhaseDisciplines(p, t.phase).join(", ") ||
                            "Any discipline"}
                      </small>
                    </span>
                    <span>{nameFor(t.accountId)}</span>
                    <Status status={t.status} />
                    {t.status !== "confirmed" && p.status !== "completed" ? (
                      <select
                        aria-label={`Reassign ${t.phase}`}
                        value=""
                        onChange={(e) => reassign(p, t.phase, e.target.value)}
                      >
                        <option value="">Reassign…</option>
                        {spmCandidates(state, p.type, t.phase, p.id).map(
                          (c) => (
                            <option key={c.account.id} value={c.account.id}>
                              {c.account.name} · {c.matched}/{c.total} tags
                            </option>
                          ),
                        )}
                      </select>
                    ) : (
                      <span className="locked-label">
                        <Icon name="shield" size={14} />
                        Locked
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
            <section className="detail-section">
              <h3>Project progress & review history</h3>
              {p.history.map((h, i) => (
                <div className="history-row" key={i}>
                  <span>
                    <Icon
                      name={h.clientVisible === false ? "clock" : "check"}
                      size={16}
                    />
                  </span>
                  <div>
                    <strong>{h.text}</strong>
                    <p>
                      {dateLabel(h.date)} ·{" "}
                      {h.clientVisible === false
                        ? "Pending / internal"
                        : "Approved / recorded"}
                    </p>
                    {h.evidence && (
                      <Button
                        variant="text-button"
                        icon="doc"
                        onClick={() => previewDoc(h.evidence!)}
                      >
                        View retained evidence · {h.evidence.name}
                      </Button>
                    )}
                  </div>
                  <b>{h.progress}%</b>
                </div>
              ))}
            </section>
            {p.status === "active" && (
              <section className="detail-section">
                <h3>
                  Schedule performance <Badge>Recorded</Badge>
                </h3>
                <Chart compact projects={[p]} />
              </section>
            )}
          </>
        )}
        <ClientSubconAdminCard
          project={p}
          onPreview={previewDoc}
          onResolve={(issueId, text) => resolveSubconIssue(p.id, issueId, text)}
        />
        <section className="detail-section">
          <div className="section-title">
            <h3>Project document repository</h3>
            {p.docs.some((d) => d.uploaded) && (
              <Button
                icon="download"
                onClick={async () => {
                  for (const d of p.docs.filter((d) => d.uploaded))
                    await downloadDoc(d)
                  setToast(
                    "Document downloads requested. Your browser may ask to allow multiple downloads.",
                  )
                }}
              >
                Download all
              </Button>
            )}
          </div>
          <p className="section-description">
            Registered documents belong to the Office PM and Lead Site PM.
            Administrator can view and download, not upload on their behalf.
          </p>
          <DocumentList docs={p.docs} onPreview={previewDoc} />
        </section>
        <section className="detail-section">
          <h3>Engineer engagement agreements</h3>
          <p className="section-description">
            Project-specific appointments for assigned Office PMs and Site PMs.
          </p>
          {staff
            .filter((a) => a.role === "opm" || a.role === "spm")
            .map((a) => (
              <div className="engagement-row" key={a.id}>
                <span className="avatar small">{initials(a.name)}</span>
                <div>
                  <strong>{a.name}</strong>
                  <p>{ROLE_NAMES[a.role]}</p>
                </div>
                {p.docs.some(
                  (d) =>
                    d.subjectId === a.id ||
                    d.label === `${a.name} — Engagement Agreement`,
                ) ? (
                  <Badge tone="green">Agreement on file</Badge>
                ) : p.status === "completed" ? (
                  <Badge>Not on file</Badge>
                ) : (
                  <Upload
                    label={`${a.name} — Engagement Agreement`}
                    onSave={(d) => addEngagement(p, a, d)}
                  />
                )}
              </div>
            ))}
        </section>
        <div className="modal-actions">
          <Button onClick={() => setDialog(undefined)}>Close</Button>
          {p.status === "changes_requested" && (
            <Button
              variant="primary"
              onClick={() => setDialog({ kind: "intake", id: p.id })}
            >
              Review staffing & resubmit
            </Button>
          )}
        </div>
      </>
    )
  }
  function accountDetails(a: Account, docsOnly = false) {
    const projects = state.projects.filter(
      (p) =>
        p.opmId === a.id ||
        p.team.some((t) => t.accountId === a.id) ||
        (a.role === "client" && a.scope.includes(p.id)),
    )
    const activeEmployeeProjects = activeAssignmentsForAccount(state, a.id)
    const resignationRecords = [
      ...(a.resignationHistory || []),
      ...(a.resignation ? [a.resignation] : []),
    ]
    return (
      <>
        <div className="detail-hero">
          <span className="avatar extra-large">{initials(a.name)}</span>
          <div>
            <span className="eyebrow">{ROLE_NAMES[a.role]}</span>
            <h3>{a.name}</h3>
            <p>{a.email}</p>
          </div>
          <Status status={a.status} />
        </div>
        {!docsOnly && (
          <>
            <div className="detail-grid account-detail-grid">
              <div>
                <small>CONTACT NUMBER</small>
                <strong>{a.phone || "Not provided"}</strong>
                {a.contactPerson && <p>Contact: {a.contactPerson}</p>}
              </div>
              <div>
                <small>ADDED</small>
                <strong>{dateLabel(a.added)}</strong>
              </div>
              <div>
                <small>DISCIPLINE / SPECIALIZATION</small>
                <strong>
                  {[
                    ...a.scope.map((s) =>
                      a.role === "client" ? projectFor(s) : s,
                    ),
                    ...a.projectTypes,
                  ].join(", ") || "Organization-wide"}
                </strong>
              </div>
              <div>
                <small>WORKLOAD</small>
                <strong>
                  {workload(state, a.id)} / {state.rules.cap} active projects
                </strong>
              </div>
            </div>
            {a.cooldown && a.cooldown > Date.now() && (
              <div className="notice">
                <Icon name="clock" />
                <p>
                  Office PM cooldown until{" "}
                  {new Date(a.cooldown).toLocaleString()}. Not eligible for new
                  recommendations.
                </p>
                <Button
                  onClick={() => updateAccount({ ...a, cooldown: undefined })}
                >
                  Clear cooldown
                </Button>
              </div>
            )}
            {a.assignmentHold && a.resignation?.status === "notice" && (
              <div className="attention-strip">
                <span className="attention-icon">
                  <Icon name="clock" />
                </span>
                <div>
                  <strong>Assignment Hold active</strong>
                  <span>
                    No new allocations · Deactivation effective{" "}
                    {dateLabel(a.resignation.effectiveDate)}
                  </span>
                </div>
              </div>
            )}
            <div className="profile-actions">
              <Button
                disabled={a.status === "deactivated"}
                icon="edit"
                onClick={() => setDialog({ kind: "edit-account", id: a.id })}
              >
                Edit account
              </Button>
              {a.id !== admin.id &&
                a.status !== "deactivated" &&
                (a.role === "client" ? (
                  <Button
                    variant={
                      ["suspended", "deactivated"].includes(a.status)
                        ? ""
                        : "danger-ghost"
                    }
                    onClick={() => toggleStatus(a)}
                  >
                    {["suspended", "deactivated"].includes(a.status)
                      ? "Reactivate account"
                      : "Suspend account"}
                  </Button>
                ) : ["suspended", "deactivated"].includes(a.status) ? (
                  <Button onClick={() => toggleStatus(a)}>
                    Reactivate account
                  </Button>
                ) : (
                  a.status === "active" &&
                  !a.assignmentHold && (
                    <Button
                      variant="danger-ghost"
                      onClick={() =>
                        setDialog({ kind: "account-deactivation", id: a.id })
                      }
                    >
                      Manage resignation
                    </Button>
                  )
                ))}
            </div>
            {activeEmployeeProjects.length > 0 &&
              a.role !== "client" &&
              a.status === "active" &&
              !a.assignmentHold && (
                <p className="section-description">
                  Routine resignation is restricted while{" "}
                  {activeEmployeeProjects.length} active project assignment
                  {activeEmployeeProjects.length === 1 ? "" : "s"} remain.
                </p>
              )}
            {resignationRecords.length > 0 && (
              <section className="detail-section resignation-history">
                <h3>Deactivation & resignation history</h3>
                {resignationRecords.map((record, index) => (
                  <div
                    className="resignation-history-row"
                    key={`${record.confirmedAt}-${index}`}
                  >
                    <span className="file-icon">
                      <Icon name="doc" />
                    </span>
                    <div>
                      <strong>
                        {record.status === "notice"
                          ? "Notice period active"
                          : "Account deactivated"}
                      </strong>
                      <p>
                        {record.noticeDays} day notice · Effective{" "}
                        {dateLabel(record.effectiveDate)} · Confirmed by{" "}
                        {record.confirmedBy}
                      </p>
                    </div>
                    <Button
                      variant="text-button"
                      onClick={() => previewDoc(record.letter)}
                    >
                      View resignation letter
                    </Button>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
        {a.role !== "client" && (
          <>
            <section className="detail-section">
              <div className="section-title">
                <h3>Professional credentials</h3>
                <Status status={licenseState(a, state.rules.grace)} />
              </div>
              <div className="credential-record">
                <span className="credential-icon">
                  <Icon name="shield" size={30} />
                </span>
                <div>
                  <strong>{a.license || "No license on file"}</strong>
                  <p>
                    {a.expiry
                      ? `Expiry: ${dateLabel(a.expiry)} · Grace period: ${state.rules.grace} days`
                      : "Add a license record and supporting document when applicable."}
                  </p>
                  {["Grace expired", "Expired"].includes(
                    licenseState(a, state.rules.grace),
                  ) && (
                    <p className="error">
                      License requires renewal. Login and new assignments remain
                      subject to eligibility rules.
                    </p>
                  )}
                </div>
                <Button
                  disabled={a.status === "deactivated"}
                  icon="upload"
                  onClick={() => setDialog({ kind: "license", id: a.id })}
                >
                  {a.license ? "Renew license" : "Add license"}
                </Button>
              </div>
              {a.certifications && (
                <div className="tag-list subsection">
                  {a.certifications.map((cert) => (
                    <span key={cert}>{cert}</span>
                  ))}
                </div>
              )}
              {a.license && (
                <Button
                  variant="text-button"
                  icon="bell"
                  onClick={() =>
                    commit(
                      (s) => s,
                      "License renewal reminder recorded",
                      `${a.name} · Reminder logged in SITELINE.`,
                      "notice",
                      "Engineer directory",
                    )
                  }
                >
                  Notify engineer
                </Button>
              )}
            </section>
            <section className="detail-section">
              <h3>Engineer documents</h3>
              <DocumentList docs={a.docs} onPreview={previewDoc} />
              <div className="document-upload">
                <div>
                  <strong>Employment contract</strong>
                  <p>
                    Company-wide signed agreement · PDF, JPG or PNG, up to 10 MB
                  </p>
                </div>
                {a.docs.some((d) => d.label === "Employment Contract") ? (
                  <Badge tone="green">On file</Badge>
                ) : (
                  <Upload
                    disabled={a.status === "deactivated"}
                    label="Employment Contract"
                    onSave={(d) => addAccountDoc(a, d)}
                  />
                )}
              </div>
            </section>
          </>
        )}
        {!docsOnly && (
          <section className="detail-section">
            <h3>Assignment history</h3>
            {projects.length ? (
              projects.map((p) => (
                <button
                  className="assignment-history"
                  key={p.id}
                  onClick={() => setDialog({ kind: "project", id: p.id })}
                >
                  <span className="file-icon">
                    <Icon name="building" />
                  </span>
                  <span>
                    <strong>{p.name}</strong>
                    <small>
                      {p.phase} · {p.progress}%
                    </small>
                  </span>
                  <Status status={p.status} />
                  <Icon name="chevron" size={17} />
                </button>
              ))
            ) : (
              <Empty title="No assignments yet" />
            )}
          </section>
        )}
        <div className="modal-actions">
          <Button onClick={() => setDialog(undefined)}>Close</Button>
          {docsOnly && (
            <Button onClick={() => setDialog({ kind: "account", id: a.id })}>
              View personnel profile
            </Button>
          )}
        </div>
      </>
    )
  }
  function companyDetails(c: Company) {
    return (
      <>
        <div className="detail-hero">
          <span className="company-monogram large">{initials(c.name)}</span>
          <div>
            <span className="eyebrow">PROJECT-LEVEL SUBCONTRACTOR</span>
            <h3>{c.name}</h3>
            <p>{c.email}</p>
          </div>
          <Status status={c.status} />
        </div>
        <div className="detail-grid account-detail-grid">
          <div>
            <small>CONTACT PERSON</small>
            <strong>{c.contact}</strong>
          </div>
          <div>
            <small>PHONE</small>
            <strong>{c.phone}</strong>
          </div>
          <div>
            <small>AVAILABILITY</small>
            <strong>{c.availability.replace("_", " ")}</strong>
          </div>
          <div>
            <small>AVAILABLE MANPOWER</small>
            <strong>{c.manpowerCount}</strong>
          </div>
        </div>
        <p className="section-description">{c.note}</p>
        <section className="detail-section">
          <h3>Active project commitments</h3>
          <div className="tag-list subsection">
            {c.activeProjectIds.map((projectId) => (
              <span key={projectId}>{projectFor(projectId)}</span>
            ))}
          </div>
          {!c.activeProjectIds.length && (
            <Empty title="No active project commitments" />
          )}
        </section>
        <section className="detail-section">
          <h3>Manpower list documents</h3>
          <p className="section-description">
            Company-level manpower lists only. Individual worker records are not
            stored in the directory.
          </p>
          <DocumentList
            docs={c.manpowerDocuments}
            onPreview={previewDoc}
            spreadsheet
            onUpload={(document) =>
              updateCompany(
                {
                  ...c,
                  manpowerDocuments: [...c.manpowerDocuments, document],
                },
                "Company manpower list uploaded",
              )
            }
            uploadLabel="Company manpower list"
          />
        </section>
        <section className="detail-section">
          <h3>Supporting documents</h3>
          <DocumentList
            docs={c.documents}
            onPreview={previewDoc}
            onUpload={(d) =>
              updateCompany(
                { ...c, documents: [...c.documents, d] },
                "Company supporting document uploaded",
              )
            }
            uploadLabel="Company supporting document"
          />
        </section>
        <div className="modal-actions">
          <Button onClick={() => setDialog(undefined)}>Close</Button>
          {c.status === "pending" && (
            <>
              <Button
                variant="danger-ghost"
                onClick={() => approval(c, "rejected")}
              >
                Reject request
              </Button>
              <Button variant="primary" onClick={() => approval(c, "approved")}>
                Approve company
              </Button>
            </>
          )}
        </div>
      </>
    )
  }
  const globalProjects = state.projects.filter((p) =>
    p.name.toLowerCase().includes(globalQuery.toLowerCase()),
  )
  const globalPeople = state.accounts.filter((a) =>
    a.name.toLowerCase().includes(globalQuery.toLowerCase()),
  )
  if (signedOut || checkingSession || !actor.id)
    return <LoginPage checkingSession={checkingSession} onSignIn={signIn} />
  if (actor.role === "client") {
    const views = clientProjectViews(state, actor.id)
    return (
      <ClientPortal
        key={actor.id}
        actor={{
          id: actor.id,
          name: actor.name,
          email: actor.email,
          status: actor.status,
        }}
        projects={views}
        onResolve={(projectId, documentId, kind) => {
          if (signedOut)
            throw new Error("Sign in again before opening records.")
          return kind === "document"
            ? resolveClientDocument(
                stateRef.current,
                actor.id,
                projectId,
                documentId,
              )
            : resolveClientPhoto(
                stateRef.current,
                actor.id,
                projectId,
                documentId,
              )
        }}
        onReport={(projectId) => {
          if (signedOut)
            throw new Error("Sign in again before exporting records.")
          return clientProgressReport(stateRef.current, actor.id, projectId)
        }}
        onRecord={(projectId, title, detail) => {
          if (
            !clientProjectViews(stateRef.current, actor.id).some(
              (p) => p.id === projectId,
            )
          )
            return
          setState((current) => ({
            ...current,
            events: [
              {
                id: uid(),
                title,
                detail,
                type: "view",
                date: new Date().toISOString(),
                read: false,
                actorId: actor.id,
                projectId,
                recipientIds: [actor.id],
                target: "Client Portal",
              },
              ...current.events,
            ],
          }))
        }}
        readNoticeIds={state.portalReads?.[actor.id] || []}
        mutedTypes={state.userPreferences?.[actor.id] || []}
        onMute={(type) => {
          if (
            actor.status !== "active" ||
            !["request", "approval", "progress", "notice"].includes(type)
          )
            return
          setState((current) => {
            const muted = current.userPreferences?.[actor.id] || []
            return {
              ...current,
              userPreferences: {
                ...current.userPreferences,
                [actor.id]: muted.includes(type)
                  ? muted.filter((value) => value !== type)
                  : [...muted, type],
              },
            }
          })
        }}
        onRead={(ids) =>
          setState((current) => {
            const allowed = new Set(
              clientProjectViews(current, actor.id).flatMap((p) =>
                p.history.map((h) => h.id),
              ),
            )
            return {
              ...current,
              portalReads: {
                ...current.portalReads,
                [actor.id]: [
                  ...new Set([
                    ...(current.portalReads?.[actor.id] || []),
                    ...ids.filter((id) => allowed.has(id)),
                  ]),
                ],
              },
            }
          })
        }
        paused={signedOut}
        onResume={endSession}
        onPause={endSession}
        idleWarning={idleWarning}
        onStayActive={() => setIdleWarning(false)}
      />
    )
  }
  if (actor.role === "opm" || actor.role === "spm")
    return (
      <RoleWorkspace
        key={actor.id}
        state={state}
        actor={actor}
        onCommand={sendWorkflow}
        onRead={(ids) =>
          setState((current) => ({
            ...current,
            events: current.events.map((e) =>
              ids.includes(e.id)
                ? {
                    ...e,
                    readBy: [...new Set([...(e.readBy || []), actor.id])],
                  }
                : e,
            ),
          }))
        }
        onMute={(type) =>
          setState((current) => {
            const muted = current.userPreferences?.[actor.id] || []
            return {
              ...current,
              userPreferences: {
                ...current.userPreferences,
                [actor.id]: muted.includes(type)
                  ? muted.filter((t) => t !== type)
                  : [...muted, type],
              },
            }
          })
        }
        paused={signedOut}
        idleWarning={idleWarning}
        onStayActive={() => setIdleWarning(false)}
        onResume={endSession}
        onPause={endSession}
      />
    )
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">
            <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <path
                d="M6 25V13l10-7 10 7v12M11 25V15l5-3 5 3v10M4 25h24"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinejoin="round"
              />
              <path d="M16 12v13" stroke="currentColor" strokeWidth="2.2" />
            </svg>
          </span>
          <div>
            SITELINE<small>Project operations</small>
          </div>
        </div>
        <div className="workspace-switch">
          <span className="workspace-avatar">10</span>
          <span>
            <strong>10 Builders</strong>
            <small>Administrator workspace</small>
          </span>
          <Icon name="down" size={15} />
        </div>
        <nav aria-label="Main navigation">
          {NAV.map((n) => (
            <div key={n.label}>
              {n.group && <div className="nav-group-label">{n.group}</div>}
              <button
                aria-label={n.label}
                className={`nav-item ${page === n.label ? "active" : ""}`}
                onClick={() => navigate(n.label)}
              >
                <Icon name={n.icon} size={19} />
                <span>{n.label}</span>
                {n.label === "Directory" && pending.length > 0 && (
                  <b className="nav-count">{pending.length}</b>
                )}
                {n.label === "Dashboard" && page === n.label && <i />}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button onClick={() => setDialog({ kind: "help" })}>
            <Icon name="doc" size={18} />
            Workspace guide
            <Icon name="arrow" size={15} />
          </button>
          <div className="sidebar-person">
            <span className="avatar">{initials(admin.name)}</span>
            <span>
              <strong>{admin.name}</strong>
              <small>Administrator</small>
            </span>
            <Button
              icon="logout"
              variant="icon-button"
              aria-label="Sign out"
              onClick={() =>
                setConfirmation({
                  title: "Sign out?",
                  message:
                    "Your local workspace records are retained in this browser.",
                  action: endSession,
                })
              }
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
              variant="icon-button"
              icon="menu"
              aria-label="Open navigation"
              onClick={() => setMobileNav(!mobileNav)}
            />
            <span>Workspace</span>
            <Icon name="chevron" size={14} />
            {adminBreadcrumb(page, documentsTab, directoryTab).map(
              (part, index, all) => (
                <Fragment key={part}>
                  {index > 0 && <Icon name="chevron" size={14} />}
                  {index === all.length - 1 ? (
                    <strong>{part}</strong>
                  ) : (
                    <span>{part}</span>
                  )}
                </Fragment>
              ),
            )}
          </div>
          <div className="topbar-actions">
            <button
              className="global-search-trigger"
              onClick={() => setDialog({ kind: "search" })}
            >
              <Icon name="search" size={18} />
              <span>Search workspace</span>
            </button>
            <span className="topbar-divider" />
            <div className="notification-container">
              <Button
                icon="bell"
                variant="icon-button notification-button"
                aria-label={`Notifications, ${unread} unread`}
                onClick={() => setNotifications(!notifications)}
              />
              {unread > 0 && <span className="notification-dot" />}
              {notifications && (
                <div className="notification-popover">
                  <div className="popover-heading">
                    <h3>
                      Notifications <span>{unread}</span>
                    </h3>
                    <Button
                      variant="text-button"
                      onClick={() =>
                        setState((s) => ({
                          ...s,
                          events: s.events.map((e) => ({ ...e, read: true })),
                        }))
                      }
                    >
                      Mark all read
                    </Button>
                  </div>
                  {activityList(
                    state.events
                      .filter(
                        (e) =>
                          !state.muted.includes(e.type) &&
                          [
                            "request",
                            "approval",
                            "progress",
                            "notice",
                          ].includes(e.type),
                      )
                      .slice(0, 5),
                    true,
                  )}
                  <Button
                    className="full-width"
                    onClick={() => {
                      setNotifications(false)
                      setDialog({ kind: "activity" })
                    }}
                  >
                    View activity log
                    <Icon name="arrow" size={15} />
                  </Button>
                </div>
              )}
            </div>
            <button
              className="topbar-avatar avatar"
              aria-label="View Administrator profile"
              onClick={() => setDialog({ kind: "account", id: admin.id })}
            >
              {initials(admin.name)}
            </button>
          </div>
        </header>
        <main className="main-content">
          <div className="workspace-meta">
            <span>
              <i className="status-dot green" />
              10 Builders <span className="mid-dot">/</span> Administrator
            </span>
            <span>
              <Icon name="calendar" size={15} />
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
          {renderPage()}
        </main>
      </div>
      {dialog?.kind === "intake" && (
        <Modal
          title={selectedProject ? "Resubmit project" : "New project intake"}
          subtitle="A strong start for every project."
          wide
          onClose={() => setDialog(undefined)}
        >
          <IntakeForm
            state={state}
            project={selectedProject}
            onClose={() => setDialog(undefined)}
            onSubmit={addProject}
            onClient={(a) =>
              commit(
                (s) => ({ ...s, accounts: [...s.accounts, a] }),
                "Client details saved",
                `${a.name} · Access remains inactive`,
                "account",
                "Team",
              )
            }
          />
        </Modal>
      )}
      {dialog?.kind === "sent" && selectedProject && (
        <Modal
          title="Project handed off successfully"
          subtitle="The first step is complete."
          onClose={() => setDialog(undefined)}
        >
          <div className="success-state">
            <span>
              <Icon name="check" size={32} />
            </span>
            <h3>{selectedProject.name}</h3>
            <p>
              Sent to <strong>{nameFor(selectedProject.opmId)}</strong> for
              Office PM acceptance.
            </p>
          </div>
          <div className="notice">
            <Icon name="clock" />
            <p>
              The Office PM must accept and upload six required documents before
              the Site PM team can accept. Client access remains inactive.
            </p>
          </div>
          <div className="modal-actions">
            <Button variant="primary" onClick={() => setDialog(undefined)}>
              Back to intake log
            </Button>
          </div>
        </Modal>
      )}
      {(dialog?.kind === "project" || dialog?.kind === "project-docs") &&
        selectedProject && (
          <Modal
            title={
              dialog.kind === "project-docs"
                ? "Project documents"
                : "Project details"
            }
            subtitle="Administrator · Project monitoring"
            wide
            onClose={() => setDialog(undefined)}
          >
            {projectDetails(selectedProject, dialog.kind === "project-docs")}
          </Modal>
        )}
      {(dialog?.kind === "account" || dialog?.kind === "engineer-docs") &&
        selectedAccount && (
          <Modal
            title={
              dialog.kind === "engineer-docs"
                ? "Engineer documents"
                : "Personnel profile"
            }
            subtitle="Identity, qualifications & assignments"
            wide
            onClose={() => setDialog(undefined)}
          >
            {accountDetails(selectedAccount, dialog.kind === "engineer-docs")}
          </Modal>
        )}
      {dialog?.kind === "account-deactivation" && selectedAccount && (
        <Modal
          title="Account Deactivation & Resignation"
          subtitle={`${selectedAccount.name} · ${ROLE_NAMES[selectedAccount.role]}`}
          onClose={() => setDialog({ kind: "account", id: selectedAccount.id })}
        >
          <AccountDeactivationForm
            account={selectedAccount}
            activeProjects={activeAssignmentsForAccount(
              state,
              selectedAccount.id,
            )}
            admin={admin}
            onClose={() =>
              setDialog({ kind: "account", id: selectedAccount.id })
            }
            onConfirm={(letter, noticeDays) =>
              startResignation(selectedAccount, letter, noticeDays)
            }
          />
        </Modal>
      )}
      {(dialog?.kind === "add-account" || dialog?.kind === "edit-account") && (
        <Modal
          title={selectedAccount ? "Edit account" : "Add team account"}
          subtitle="Admin-provisioned access. Role changes require a new account."
          onClose={() => setDialog(undefined)}
        >
          <AccountForm
            state={state}
            account={selectedAccount}
            onClose={() => setDialog(undefined)}
            onSave={saveAccount}
          />
        </Modal>
      )}
      {dialog?.kind === "license" && selectedAccount && (
        <Modal
          title={
            selectedAccount.license
              ? "Renew professional license"
              : "Add professional license"
          }
          subtitle={selectedAccount.name}
          onClose={() => setDialog(undefined)}
        >
          <LicenseForm
            account={selectedAccount}
            onClose={() =>
              setDialog({ kind: "account", id: selectedAccount.id })
            }
            onSave={updateAccount}
          />
        </Modal>
      )}
      {dialog?.kind === "company" && selectedCompany && (
        <Modal
          title="Subcontractor company"
          subtitle="Company profile, availability, commitments & documents"
          wide
          onClose={() => setDialog(undefined)}
        >
          {companyDetails(selectedCompany)}
        </Modal>
      )}
      {dialog?.kind === "add-company" && (
        <Modal
          title="Add subcontractor company"
          subtitle="Administrator-verified company directory record"
          wide
          onClose={() => setDialog(undefined)}
        >
          <CompanyForm
            owner={admin.name}
            onClose={() => setDialog(undefined)}
            onSave={(company) => {
              commit(
                (current) => ({
                  ...current,
                  companies: [...current.companies, company],
                }),
                "Subcontractor company added",
                company.name,
                "account",
                "Subcon directory",
              )
              setDialog({ kind: "company", id: company.id })
            }}
          />
        </Modal>
      )}
      {dialog?.kind === "activity" && (
        <Modal
          title="Workspace activity"
          subtitle="Requests, approvals, personnel updates and document history."
          wide
          onClose={() => setDialog(undefined)}
        >
          <div className="tabs">
            {[
              "all",
              "request",
              "approval",
              "progress",
              "account",
              "view",
              "system",
            ].map((f) => (
              <button
                key={f}
                className={activityFilter === f ? "active" : ""}
                onClick={() => setActivityFilter(f)}
              >
                {f === "all" ? "All activity" : f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          {activityList(
            state.events.filter(
              (e) => activityFilter === "all" || e.type === activityFilter,
            ),
          )}
        </Modal>
      )}
      {dialog?.kind === "search" && (
        <Modal
          title="Search workspace"
          subtitle="Find projects, people and companies."
          onClose={() => setDialog(undefined)}
        >
          <Search
            value={globalQuery}
            onChange={setGlobalQuery}
            placeholder="Search the entire workspace"
          />
          <div className="global-results">
            <h4>Projects</h4>
            {globalProjects.map((p) => (
              <button
                key={p.id}
                onClick={() => setDialog({ kind: "project", id: p.id })}
              >
                <Icon name="building" />
                <span>
                  {p.name}
                  <small>
                    {p.type} · {STATUS[p.status]}
                  </small>
                </span>
                <Icon name="chevron" size={15} />
              </button>
            ))}
            <h4>People</h4>
            {globalPeople.map((a) => (
              <button
                key={a.id}
                onClick={() => setDialog({ kind: "account", id: a.id })}
              >
                <span className="avatar small">{initials(a.name)}</span>
                <span>
                  {a.name}
                  <small>{ROLE_NAMES[a.role]}</small>
                </span>
                <Icon name="chevron" size={15} />
              </button>
            ))}
            <h4>Companies</h4>
            {state.companies
              .filter((c) =>
                c.name.toLowerCase().includes(globalQuery.toLowerCase()),
              )
              .map((c) => (
                <button
                  key={c.id}
                  onClick={() => setDialog({ kind: "company", id: c.id })}
                >
                  <Icon name="users" />
                  <span>
                    {c.name}
                    <small>Subcontractor company</small>
                  </span>
                </button>
              ))}
          </div>
        </Modal>
      )}
      {dialog?.kind === "help" && (
        <Modal
          title="Welcome to your workspace"
          subtitle="Built for the work ahead."
          onClose={() => setDialog(undefined)}
        >
          <div className="help-content">
            <Icon name="building" size={36} />
            <h3>One clear view of construction operations.</h3>
            <p>
              Start a project in Project intake, review allocation eligibility,
              attach signed agreements and hand off to the Office PM. Open
              Active sites for monitoring, or manage people and records under
              Resources.
            </p>
            <h4>Records and access</h4>
            <p>
              Records are saved in this browser, and uploaded files are stored
              with them. Older document records may not include an attached
              original file.
            </p>
            <p>
              Other roles cannot be impersonated or accepted on behalf of from
              this Administrator workspace.
            </p>
          </div>
          <div className="modal-actions">
            <Button variant="primary" onClick={() => setDialog(undefined)}>
              Explore workspace
            </Button>
          </div>
        </Modal>
      )}
      {preview && (
        <Preview doc={preview} onClose={() => setPreview(undefined)} />
      )}
      {confirmation && (
        <Modal
          title={confirmation.title}
          onClose={() => setConfirmation(undefined)}
        >
          <p>{confirmation.message}</p>
          <div className="modal-actions">
            <Button onClick={() => setConfirmation(undefined)}>Cancel</Button>
            <Button
              variant={confirmation.destructive ? "danger" : "primary"}
              onClick={() => {
                confirmation.action()
                setConfirmation(undefined)
              }}
            >
              Confirm
            </Button>
          </div>
        </Modal>
      )}
      {credentials && (
        <Modal
          title="Account created"
          subtitle="Copy these temporary credentials now."
          onClose={() => setCredentials(undefined)}
        >
          <div className="success-state">
            <span>
              <Icon name="check" size={28} />
            </span>
            <h3>{credentials.name}</h3>
          </div>
          <div className="password-display">
            <code>{credentials.password}</code>
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(credentials.password)
                  setToast("Temporary password copied")
                } catch {
                  setToast(
                    "Copy is unavailable. Select and copy the displayed password.",
                  )
                }
              }}
            >
              Copy
            </Button>
          </div>
          <p>
            Shown once in this session. This is a local account record;
            credential delivery and authentication need a backend. No invitation
            email was sent.
          </p>
          <div className="modal-actions">
            <Button variant="primary" onClick={() => setCredentials(undefined)}>
              Done
            </Button>
          </div>
        </Modal>
      )}
      {idleWarning && !signedOut && (
        <div className="session-warning">
          <Icon name="clock" />
          <span>Your session will pause after inactivity.</span>
          <Button onClick={() => setIdleWarning(false)}>Stay signed in</Button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>
            <Icon name="check" size={18} />
          </span>
          {toast}
          <Button
            variant="icon-button"
            icon="close"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          />
        </div>
      )}
    </div>
  )
}

export default function App() {
  return (
    <>
      <AppInner />
      {apiEnabled && (
        <div className="api-mode-banner" role="status">
          Database workspace · view only
        </div>
      )}
    </>
  )
}

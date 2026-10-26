import ExtensionWorkflow from "./ExtensionWorkflow"
import useSidebarNavigation from "./useSidebarNavigation"
import "./admin-navigation.css"
import PasswordResetRequests from "./PasswordResetRequests"
import OverallProjectProgress from "./OverallProjectProgress"
import AdminDashboard from "./AdminDashboard"
import DashboardWelcome from "./DashboardWelcome"
import NotificationDetail from "./NotificationDetail"
import NotificationMessages from "./NotificationMessages"
import { EXPERIENCE_PROJECT_TYPES, experienceText } from "../Thesis-Backend/src/domain/engineer-experience.js"
import { notificationAction } from "./notification-action"
import SitePhotoGallery from "./SitePhotoGallery"
import useNotificationSettings, { NotificationSaveStatus } from "./useNotificationSettings"
import { sessionDashboardGreeting, type LoginGreeting } from "./dashboard-greeting"
import IntakeGuidance, { AdminIntakeTable, IntakeTabs } from "./IntakeGuidance"
import { intakeGuidance, intakeViewCounts, type IntakeView } from "./intake-guidance"
import WorkspaceSkeleton from "./LoadingSkeleton"
import NavigationCount from "./NavigationCount"
import { navigationAttention } from "./navigation-attention"
import { adminDashboardOverview } from "./admin-dashboard"
import ProjectProgress from "./ProjectProgress"
import { hasPendingSiteReview } from "./active-sites-review"
import ActiveSites from "./ActiveSites"
import { leadId } from "./workflows"
import PasswordReset from "./PasswordReset"
import { persistAdminChanges, saveApiAccount, saveApiProject, PartialProjectSave, sendApiWorkflow, createCompany } from "./api/actions"
// @refresh reset
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react"
import MonthlyReport from "./MonthlyReport"
import Reports from "./Reports"
import RoleWorkspace from "./RoleWorkspace"
import LoginPage from "./LoginPage"
import { SIGN_IN_MESSAGES, guardedSignIn, localAttemptStore } from "./signInPolicy"
import { assertCanSignIn } from "./auth"
import { stubAccount } from "./api/adapter"
import {
  api,
  ApiError,
  SESSION_REPLACED_EVENT,
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
  workflowFor,
  type WorkflowCommand,
} from "./workflows"
import { Badge, Button, Empty, Field, Icon, Modal } from "./ui"
import {
  EngineerHistory,
  LicenseAssignmentWarning,
  LicenseProfileBlock,
  OverrideDialog,
  PhaseLicenseFlag,
  RenewalQueue,
  WorkRecord,
  type OverrideTarget,
} from "./LicenseWorkflow"
import {
  AccountDeactivationForm,
  AccountForm,
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
  PROJECT_TYPES,
  type Account,
  type Company,
  type Doc,
  type Event,
  type Project,
  type State,
} from "./model"
import { projectDocumentIndex } from "./project-document-index"
import {
  CompactPager,
  ListPager,
  ListSection,
  ListToolbar,
  NoResults,
  getListQuery,
  remoteList,
  resetListMemory,
  runList,
  updateListQuery,
  useListMemory,
} from "./ListControls"
import {
  inDateRange,
  optionsFrom,
  stableSort,
  withPage,
  type FilterDef,
} from "./listing"
import { engineerQueryString } from "./listSource"
import { useAccountsPage } from "./useAccountsPage"
import {
  ADMIN_NAV,
  DIRECTORY_TABS,
  DOCUMENT_TABS,
  adminBreadcrumb,
  resolveAdminTarget,
  normalizeWorkspacePage,
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
                "Renewal under review",
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
const ACCOUNT_UNAVAILABLE_MESSAGE = SIGN_IN_MESSAGES.inactive
const INVALID_CREDENTIALS_MESSAGE = SIGN_IN_MESSAGES.mismatch
const signInAttempts = localAttemptStore()
function AppInner() {
  const [state, setState] = useState<State>(emptyState)
  useListMemory()
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
  const [intakeView, setIntakeView] = useState<IntakeView>("all")
  const [dialog, setDialog] = useState<Dialog>()
  const [preview, setPreview] = useState<Doc>()
  const [reportProjectId,setReportProjectId]=useState("")
  const [toast, setToast] = useState("")
  const [query, setQuery] = useState("")
  const [globalQuery, setGlobalQuery] = useState("")
  const [filter, setFilter] = useState("all")
  const [subconTab, setSubconTab] = useState("registered")
  const [documentsTab, setDocumentsTab] = useState<DocumentsTab>("project")
  const [directoryTab, setDirectoryTab] = useState<DirectoryTab>("engineers")
  const [tab, setTab] = useState("closed")
  const [notifications, setNotifications] = useState(false)
  const [selectedNotification, setSelectedNotification] = useState<Event>()
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
  const navigation = useSidebarNavigation(!signedOut && actor.role === "admin")
  const notificationSettings = useNotificationSettings(actor.id, stateRef, setState, signedOut)
  const [sessionMessage, setSessionMessage] = useState("")
  const [welcomeGreeting, setWelcomeGreeting] = useState<LoginGreeting>()
  const [checkingSession, setCheckingSession] = useState(true)
  const [loadingWorkspaceRole, setLoadingWorkspaceRole] = useState<Account["role"]>()
  const [readinessAvailable, setReadinessAvailable] = useState(false)
  const [mustResetPassword,setMustResetPassword]=useState(false)
  const [idleWarning, setIdleWarning] = useState(false)
  const [archiveDays, setArchiveDays] = useState(60)
  const [roleFilter, setRoleFilter] = useState("all")
  const [licenseFilter, setLicenseFilter] = useState("all")
  const [overrideTarget, setOverrideTarget] = useState<OverrideTarget>()
  const [renewalsOpen, setRenewalsOpen] = useState(false)
  const [activityFilter, setActivityFilter] = useState("all")
  const active = state.projects.filter((p) => p.status === "active")
  const intake = state.projects.filter((p) =>
    ["pending", "draft", "changes_requested"].includes(p.status),
  )
  const pending = state.companies.filter((c) => c.status === "pending")
  const engineers = state.accounts.filter((a) => a.role !== "client")
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

  // Restores the signed-in session after a refresh. Only a rejected token or an
  // account that may no longer sign in ends the session; a server or network
  // hiccup keeps the token and offers a retry instead of the login page.
  const [restoreError, setRestoreError] = useState("")
  const [restoreAttempt, setRestoreAttempt] = useState(0)
  useEffect(() => {
    if (!tokenUser()) {
      setCheckingSession(false)
      return
    }
    let cancelled = false
    setCheckingSession(true)
    setRestoreError("")
    api<Parameters<typeof startApiSession>[0]>("/auth/me")
      .then(startApiSession)
      .then((account) => {
        if (cancelled) return
        setSessionId(account.id)
        setWelcomeGreeting(account.role === "client" ? undefined : sessionDashboardGreeting(account.id, account.name))
        setSignedOut(false)
      })
      .catch((error) => {
        if (cancelled) return
        const transient =
          error instanceof TypeError ||
          (error instanceof ApiError && (error.status === 0 || error.status >= 500))
        if (transient && tokenUser()) {
          setRestoreError("Your session is still active, but the workspace could not be loaded.")
          return
        }
        clearSession()
        apiLogout()
      })
      .finally(() => {
        if (!cancelled) setCheckingSession(false)
      })
    return () => {
      cancelled = true
    }
  }, [restoreAttempt])
  useEffect(() => {
    const replaced = (event: globalThis.Event) => {
      endSession()
      setSessionMessage((event as CustomEvent<string>).detail)
    }
    window.addEventListener(SESSION_REPLACED_EVENT, replaced)
    return () => window.removeEventListener(SESSION_REPLACED_EVENT, replaced)
  }, [])
  useEffect(() => {
    if (signedOut) return
    const check = () => {
      if (document.visibilityState !== "hidden") void api("/auth/me").catch(() => {})
    }
    const timer = window.setInterval(check, 15000)
    window.addEventListener("focus", check)
    document.addEventListener("visibilitychange", check)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", check)
      document.removeEventListener("visibilitychange", check)
    }
  }, [signedOut])
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
  async function reloadWorkspace() {
    let loaded: State
    try { loaded=await loadApiState({id:actor.id,role:actor.role,full_name:actor.name,email:actor.email}) }
    catch (error) { setReadinessAvailable(false); throw error }
    stateRef.current=loaded
    setState(loaded)
    setReadinessAvailable(true)
    return loaded
  }
  // Let the next Site PM see an OPM handoff without a manual page reload.
  useEffect(() => {
    if (signedOut || !["admin", "opm", "spm"].includes(actor.role) || !tokenUser()) return
    let active = true, loading = false
    const refresh = async () => {
      if (!active || loading || document.visibilityState === "hidden") return
      loading = true
      const snapshot = stateRef.current
      try {
        const loaded = await loadApiState({ id: actor.id, role: actor.role, full_name: actor.name, email: actor.email })
        if (active && stateRef.current === snapshot) { stateRef.current = loaded; setState(loaded); setReadinessAvailable(true) }
      } catch { if(active)setReadinessAvailable(false) /* A failed read does not assert current blockers. */ }
      finally { loading = false }
    }
    const timer = window.setInterval(() => { void refresh() }, 15000)
    const onFocus = () => { void refresh() }
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onFocus)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus) }
  }, [actor.id, actor.role, signedOut])
  async function commit(change:(s:State)=>State,title:string,detail="",type="account",target=page) {
    if(signedOut||actor.role!=="admin"){setToast("Sign in again to continue.");return}
    try {
      const current=stateRef.current
      await persistAdminChanges(current,change(current))
      await reloadWorkspace()
      setToast(title)
      return true
    } catch(error) { setToast((error as Error).message);return false }
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
    setPage(target ? target.page : normalizeWorkspacePage(next))
    resetListState()
    if (target?.documentsTab) setDocumentsTab(target.documentsTab)
    if (target?.directoryTab) setDirectoryTab(target.directoryTab)
    if (target?.subconTab) setSubconTab(target.subconTab)
    navigation.closeMobile()
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
  // Needs attention → "Engineer license expired": open the override for the first assignment that still needs cover.
  function openLicenseCover(userId: string) {
    const item = state.license?.overview?.find((i) => i.id === userId)
    const open = item?.assignments.find((a) => !a.pendingOverrideId)
    if (open) setOverrideTarget({ projectId: open.projectId, stageId: open.stageId })
    else setDialog({ kind: "account", id: userId })
  }
  function clearSession() {
    resetListMemory()
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
    setLoadingWorkspaceRole(user.role)
    setReadinessAvailable(false)
    try {
      setMustResetPassword(!!(user as {temp_password_issued?:boolean}).temp_password_issued)
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
      setReadinessAvailable(true)
      return account
    } finally {
      setLoadingWorkspaceRole(undefined)
    }
  }
  async function signIn(email: string, password: string, replaceSession = false) {
    const account: Account = await guardedSignIn(signInAttempts,email,async()=>{
    let user: Awaited<ReturnType<typeof apiLogin>>
    try {
      user = await apiLogin(email, password, replaceSession)
    } catch (error) {
      if (error instanceof ApiError && error.code === "ACCOUNT_ALREADY_SIGNED_IN") throw error
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
      return account
    })
    setDialog(undefined)
    setPreview(undefined)
    setConfirmation(undefined)
    setCredentials(undefined)
    setNotifications(false)
    setSelectedNotification(undefined)
    setSessionId(account.id)
    setSessionMessage("")
    setWelcomeGreeting(account.role === "client" ? undefined : sessionDashboardGreeting(account.id, account.name, { fresh: true }))
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
    setSelectedNotification(undefined)
    setWelcomeGreeting(undefined)
    setSignedOut(true)
    setSessionId("")
    apiLogout()
    const empty = emptyState()
    stateRef.current = empty
    setState(empty)
  }
  async function sendWorkflow(command:WorkflowCommand) {
    if(signedOut)return {ok:false,error:"Your session has ended. Sign in again to continue."}
    try{
      const response = await sendApiWorkflow(stateRef.current,actor,command)
      await reloadWorkspace()
      const message = response?.handoff?.advanced ? `Activity approved. ${response.handoff.current_stage} automatically activated for its assigned Site PM.`
        : response?.handoff?.reason ? `Activity approved. Phase remains open: ${response.handoff.reason}`
        : undefined
      return {ok:true, message}
    }catch(error){
      return {ok:false,error:(error as Error).message}
    }
  }
  async function updateAccount(account:Account) {
    try{await saveApiAccount(account,true);await reloadWorkspace();setToast("Account details updated");setDialog({kind:"account",id:account.id});return true}
    catch(error){setToast((error as Error).message);return false}
  }
  async function saveAccount(account:Account,password?:string) {
    try{
      const exists=stateRef.current.accounts.some(a=>a.id===account.id)
      const saved=await saveApiAccount(account,exists,password)
      await reloadWorkspace();setDialog(undefined)
      if(!exists&&saved.password)setCredentials({name:account.name,password:saved.password})
      setToast(exists?"Account updated":"Account created")
    }catch(error){setToast((error as Error).message);throw error}
  }
  async function saveClient(account:Account) {
    const saved=await saveApiAccount(account,false)
    const loaded=await reloadWorkspace()
    return loaded.accounts.find(a=>a.id===saved.id)!
  }
  async function addProject(project:Project) {
    try {
      const exists=stateRef.current.projects.some(p=>p.id===project.id)
      const id=await saveApiProject(project,exists)
      await reloadWorkspace()
      navigate("Project intake");setDialog({kind:"sent",id})
    }catch(error){
      if(error instanceof PartialProjectSave){
        setToast(error.message);await reloadWorkspace().catch(()=>undefined)
        navigate("Project intake");setDialog({kind:"sent",id:error.id});return
      }
      setToast((error as Error).message);throw error
    }
  }
  function updateCompany(c: Company, message: string) {
    return commit(
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
  async function startResignation(a: Account, letter: Doc, noticeDays: number) {
    try {
      await api("/accounts/"+a.id+"/resignation",{method:"POST",json:{letter,noticeDays}})
      await reloadWorkspace()
      setToast(noticeDays===0?"Employee account deactivated":"Assignment Hold activated")
      setDialog({kind:"account",id:a.id})
    } catch(error){return (error as Error).message}
  }
  async function resolveSubconIssue(projectId:string,issueId:string,text:string) {
    try {
      await api("/projects/"+projectId+"/workspace-command",{method:"POST",json:{type:"resolve_client_subcon_issue",issueId,note:text}})
      await reloadWorkspace()
      setToast("Issue resolved. Lead Site PM can continue.")
    } catch(error){return (error as Error).message}
  }
  function previewDoc(d: Doc) {
    setPreview(d)
    commit((s) => s, "Document viewed", d.label, "view")
  }
  function addAccountDoc(a: Account, d: Doc) {
    return updateAccount({ ...a, docs: [...a.docs, d] })
  }
  function addEngagement(p: Project, a: Account, d: Doc) {
    return commit(
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
  // Search, filters and paging for the Admin lists. The Administrator sees every
  // record, so there is nothing to scope here; other roles scope first.
  const projectSearch = (p: Project) =>
    `${p.name} ${p.type} ${nameFor(p.opmId)}`
  const typeFilter = (items: Project[]): FilterDef<Project> => ({
    id: "type",
    label: "Project type",
    allLabel: "All types",
    options: optionsFrom(items.map((p) => p.type)),
    test: (p, value) => p.type === value,
  })
  const closedDate = (p: Project) =>
    workflowFor(p).completedAt ||
    p.history[p.history.length - 1]?.date ||
    p.created
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
  const LICENSE_OPTIONS = [
    "Valid",
    "Renewed",
    "Expiring soon",
    "Expired",
    "Grace expired",
    "Renewal under review",
    "Not on file",
  ].map((value) => ({ value, label: value }))
  const roleFilter_: FilterDef<Account> = {
    id: "role",
    label: "Role",
    allLabel: "All roles",
    options: Object.entries(ROLE_NAMES).map(([value, label]) => ({
      value,
      label,
    })),
    test: (a, value) => a.role === value,
  }
  const accountStatusFilter: FilterDef<Account> = {
    id: "status",
    label: "Account status",
    allLabel: "All account statuses",
    options: ["active", "invited", "suspended", "pending-setup", "deactivated"].map(
      (value) => ({ value, label: STATUS[value] || value }),
    ),
    test: (a, value) => a.status === value,
  }
  const licenseFilter_: FilterDef<Account> = {
    id: "license",
    label: "License status",
    allLabel: "All license statuses",
    options: LICENSE_OPTIONS,
    test: (a, value) => licenseState(a, state.rules.grace) === value,
  }
  const accountSearch = (a: Account) =>
    `${a.name} ${a.email} ${a.scope.join(" ")} ${a.license}`
  const intakeItems = state.projects.filter((p) =>
    ["pending", "changes_requested", "draft"].includes(p.status),
  )
  const intakeCounts = intakeViewCounts(intakeItems, p => intakeGuidance(state, p, actor))
  const intakeList = runList("admin:intake", intakeItems.filter(p => intakeView === "all" || intakeGuidance(state, p, actor)?.kind === intakeView), {
    searchText: projectSearch,
    filters: [
      {
        id: "status",
        label: "Status",
        allLabel: "All intake",
        options: [
          { value: "pending", label: "Awaiting confirmation" },
          { value: "changes_requested", label: "Changes requested" },
          { value: "draft", label: "Drafts" },
        ],
        test: (p, value) => p.status === value,
      },
      { ...typeFilter(intakeItems), options: PROJECT_TYPES.map(value => ({ value, label: value })) },
    ],
  })
  // Engineer Directory: the server filters, counts and pages (/accounts, ordered by
  // name then id). A license or "deactivated" filter is unknown to the server, so
  // then the very same list is filtered in the browser instead.
  const engineersConfig = {
    searchText: accountSearch,
    filters: [
      { ...roleFilter_, options: roleFilter_.options!.filter((o) => o.value !== "client") },
      accountStatusFilter,
      licenseFilter_,
    ],
  }
  const engineerPath = engineerQueryString(getListQuery("admin:engineers"))
  const engineersOnServer = engineerPath !== undefined
  const serverEngineers = useAccountsPage({
    queryString: engineerPath,
    enabled: page === "Directory" && directoryTab === "engineers",
    refreshKey: state.accounts,
    onClamp: (last) =>
      updateListQuery("admin:engineers", (q) => withPage(q, last)),
  })
  const accountsById = new Map(state.accounts.map((a) => [a.id, a]))
  const engineersList = engineersOnServer
    ? remoteList(
        "admin:engineers",
        engineersConfig,
        serverEngineers.ids
          .map((id) => accountsById.get(id))
          .filter((a): a is Account => !!a),
        serverEngineers.total,
        {
          state: serverEngineers.status,
          message: serverEngineers.message,
          onRetry: serverEngineers.retry,
        },
      )
    : runList(
        "admin:engineers",
        stableSort(engineers, (a, b) => a.name.localeCompare(b.name), (a) => a.id),
        engineersConfig,
      )
  const engineerDocsList = runList("admin:engineer-docs", engineers, {
    searchText: accountSearch,
    filters: [
      { ...roleFilter_, options: roleFilter_.options!.filter((o) => o.value !== "client") },
      licenseFilter_,
    ],
  })
  const activeCommitments = (c: Company) =>
    c.activeProjectIds.filter((id) =>
      state.projects.some((p) => p.id === id && p.status === "active"),
    ).length
  const companiesList = runList(
    "admin:companies",
    state.companies.filter((c) => c.status === "approved"),
    {
      searchText: (c) => `${c.name} ${c.contact} ${c.email}`,
      filters: [
        {
          id: "availability",
          label: "Availability",
          allLabel: "All availability",
          options: [
            { value: "available", label: "Available" },
            { value: "limited", label: "Limited availability" },
            { value: "committed", label: "Fully committed" },
          ],
          test: (c, value) => c.availability === value,
        },
        {
          id: "commitments",
          label: "Active commitments",
          allLabel: "Any",
          options: [
            { value: "has", label: "Has active commitments" },
            { value: "none", label: "No active commitments" },
          ],
          test: (c, value) =>
            value === "has" ? activeCommitments(c) > 0 : activeCommitments(c) === 0,
        },
      ],
    },
  )
  const teamLicenseItems = adminDashboardOverview(state).items.filter(item => item.category === "licenses")
  const teamAlerts = new Set(teamLicenseItems.map(item => item.id))
  const teamList = runList(
    "admin:team",
    state.accounts.filter((a) => a.status !== "deactivated"),
    {
      searchText: (a) =>
        `${a.name} ${a.email} ${a.scope.join(" ")} ${a.status}`,
      filters: [roleFilter_, accountStatusFilter, {
        id: "attention",
        label: "Attention",
        allLabel: "All accounts",
        options: [{ value: "needs-action", label: "Needs attention" }],
        test: a => teamAlerts.has(a.id),
      }],
    },
  )
  const activityLogList = runList("admin:activity", state.events, {
    searchText: (e) => `${e.title} ${e.detail}`,
    filters: [
      {
        id: "type",
        label: "Event type",
        allLabel: "All activity",
        options: [
          "request",
          "approval",
          "progress",
          "account",
          "view",
          "system",
        ].map((value) => ({
          value,
          label: value[0].toUpperCase() + value.slice(1),
        })),
        test: (e, value) => e.type === value,
      },
      {
        id: "person",
        label: "Person",
        allLabel: "Everyone",
        options: optionsFrom(
          state.events.map((e) => (e.actorId ? nameFor(e.actorId) : "")),
        ),
        test: (e, value) => !!e.actorId && nameFor(e.actorId) === value,
      },
      ...dateFilters<Event>((e) => e.date, "Date"),
    ],
  })

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
    const requestList = runList(
      `admin:subcon-${status}`,
      state.companies.filter((c) => c.status === status),
      {
        searchText: (c) =>
          `${c.name} ${c.contact} ${c.submittedBy || ""} ${projectFor(c.projectId)}`,
      },
    )
    return (
      <ListSection
        list={requestList}
        placeholder="Search requests"
        noun="request"
        empty={
          <div className="approvals-grid">
            <Empty title="No requests in this category" />
          </div>
        }
        render={(items) => (
      <div className="approvals-grid">
        {items.map((c) => (
            <Panel
              key={c.id}
              title={c.name}
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
      </div>
        )}
      />
    )
  }
  function activityList(events: Event[], compact = false, markRead = true) {
    return (
      <div className={`activity-list ${compact ? "compact-activity" : ""}`}>
        {events.length ? (
          events.map((e) => (
            <button
              className={`activity-item ${markRead && !e.read ? "unread" : ""}`}
              key={e.id}
              onClick={() => {
                if (markRead) notificationSettings.markRead([e.id])
                setNotifications(false)
                setSelectedNotification(e)
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
              {markRead && !e.read && <i className="unread-dot" />}
            </button>
          ))
        ) : (
          <Empty title="You're all caught up" />
        )}
      </div>
    )
  }
  function dashboard() {
    const dashActivity = runList("dash:admin-activity", state.events, { searchText: () => "" }, { pageSize: 5 })
    return <PasswordResetRequests>{(requests, openReset) => <AdminDashboard
      readinessAvailable={readinessAvailable}
      overview={{ ...adminDashboardOverview(state), items: [
        ...requests.map(request => ({ key: "password-reset:" + request.id, id: request.id, kind: "account" as const, category: "requests" as const, title: request.full_name, detail: "Password reset requested: " + request.email, label: "Reset password", icon: "shield" })),
        ...adminDashboardOverview(state).items,
      ] }}
      onNavigate={navigate}
      onNewIntake={() => setDialog({ kind: "intake" })}
      onActivity={() => navigate("Activity log")}
      onOpen={item => item.key.startsWith("password-reset:") ? openReset(item.id) : item.key.startsWith("license-cover:") ? openLicenseCover(item.id) : item.key.startsWith("license-renewal:") ? setRenewalsOpen(true) : setDialog({ kind: item.kind, id: item.id })}
      activity={<>{activityList(dashActivity.view.items, true)}<CompactPager list={dashActivity} /></>}
    />}</PasswordResetRequests>
  }
  function pageHeading(title: string, action?: ReactNode) {
    return (
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {["Team", "Settings", "Archive", "Activity log"].includes(page)
              ? "ORGANIZATION"
              : "CONSTRUCTION OPERATIONS"}
          </div>
          <h1>
            {title}
            <span className="heading-dot">.</span>
          </h1>
        </div>
        {action}
      </div>
    )
  }
  function renderPage() {
    if (page === "Activity log") return <>
      {pageHeading("Activity log")}
      <Panel title="Workspace activity" subtitle="Browse the activity available to your account.">
        <ListSection
          list={activityLogList}
          placeholder="Search activity"
          noun="event"
          render={items => activityList(items, false, false)}
          empty={activityList([], false, false)}
        />
      </Panel>
    </>
    if (page === "Reports") return <Reports />
    if (page === "Dashboard") return dashboard()
    if (page === "Active sites")
      return (
        <>
          {pageHeading(
            "Active sites",
          )}
          <ExtensionWorkflow actor={actor} />
          <ActiveSites key={actor.id} phaseDefinitionsByType={state.backendPhases} reviewAvailable projects={active.map(p => ({
            ...p,
            lead: state.accounts.find(a => a.id === leadId(p))?.name,
            needsReview: hasPendingSiteReview(p),
          }))} onOpen={id => setDialog({ kind: "project", id })} />
        </>
      )
    if (page === "Project intake")
      return (
        <>
          {pageHeading(
            "Project intake",
            <Button
              variant="primary"
              icon="plus"
              onClick={() => setDialog({ kind: "intake" })}
            >
              New project intake
            </Button>,
          )}
          <Panel
            title="Project intake log"
            subtitle={`${intake.length} current intake records`}
          >
            <IntakeTabs value={intakeView} counts={intakeCounts} onChange={value => { setIntakeView(value); updateListQuery("admin:intake", q => withPage(q, 1)) }} />
            <ListSection
              list={intakeList}
              placeholder="Search intake records"
              noun="record"
              render={(items) => <AdminIntakeTable state={state} projects={items} actor={actor} onOpen={(p, edit) => setDialog({ kind: edit ? "intake" : "project", id: p.id })} />}
              empty={<Empty title={!intakeItems.length ? "No intake records" : intakeView === "action" ? "No intake actions for your account" : "No intake records waiting for others"}>Existing intake records appear here as projects move through setup.</Empty>}
            />
          </Panel>
        </>
      )
    const projectDocumentsTab = () => (
        <>
          <DocumentRepository
            listKey="admin:documents"
            recentKey={actor.id}
            projects={state.projects.map((project) => ({
              id: project.id,
              name: project.name,
              subtitle: `${project.type} · ${project.phase}`,
              type: project.type,
              phase: project.phase,
              status: project.status,
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
          <Panel title="Personnel document repository">
            <ListSection
              list={engineerDocsList}
              placeholder="Search engineer name or license"
              noun="person"
              empty={<Empty title="No personnel match your search" />}
              render={(items) => (
                <div className="folder-grid">
                  {items.map((a) => (
                    <button
                      className="folder-card"
                      key={a.id}
                      onClick={() =>
                        setDialog({ kind: "engineer-docs", id: a.id })
                      }
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
              )}
            />
          </Panel>
        </>
      )
    const engineersTab = () => (
        <>
          <Panel
            title="In-house personnel"
            subtitle={`${engineers.length} engineers and administrators`}
          >
            <ListSection
              list={engineersList}
              placeholder="Search name, discipline or license"
              noun="person"
              debounceMs={engineersOnServer ? 300 : 0}
              empty={<Empty title="No matching personnel" />}
              render={(items) => (
                <div className="engineer-grid">
                  {items.map((a) => (
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
              )}
            />
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
          >
            <ListSection
              list={companiesList}
              placeholder="Search company"
              noun="company"
              empty={<Empty title="No companies match these filters" />}
              render={(items) => (
                <div className="company-grid">
                  {items.map((c) => {
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
              )}
            />
            <p className="role-muted">
              Assignments remain project-level and are not managed here.
            </p>
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
          >
            {teamAlerts.size > 0 && (
              <div className="notice team-license-notice">
                <Icon name="alert" />
                <p><strong>{teamLicenseItems.length} license {teamLicenseItems.length === 1 ? "alert" : "alerts"} across {teamAlerts.size} {teamAlerts.size === 1 ? "account" : "accounts"}.</strong> Review expiring licenses, renewal submissions, or assignments needing cover. This is what the Team badge counts.</p>
                <Button onClick={() => updateListQuery("admin:team", q => ({ ...q, search: "", filters: { attention: "needs-action" }, page: 1 }))}>View accounts</Button>
              </div>
            )}
            <ListToolbar
              list={teamList}
              placeholder="Search name, scope or status"
              noun="account"
            />
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
                  {teamList.view.items.map((a) => (
                      <tr key={a.id} className={teamAlerts.has(a.id) ? "team-needs-attention" : undefined}>
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
                              {teamAlerts.has(a.id) && <span className="team-license-alert"><Badge tone="amber">Needs attention · {licenseState(a, state.rules.grace)}</Badge><small>License expiry: {dateLabel(a.expiry)}</small>{teamLicenseItems.filter(item => item.id === a.id).map(item => <small key={item.key}>{item.detail}</small>)}</span>}
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
            {!teamList.matched.length &&
              (teamList.narrowed ? (
                <NoResults list={teamList} />
              ) : (
                <Empty title="No accounts yet" />
              ))}
            <ListPager list={teamList} />
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
      const archiveList = runList(`admin:archive-${tab}`, archived, {
        searchText: projectSearch,
        filters: [typeFilter(archived), ...dateFilters<Project>(closedDate, "Closed")],
      })
      const accountArchive = (key: string, items: Account[]) =>
        runList(key, items, {
          searchText: (a) => `${a.name} ${a.email} ${ROLE_NAMES[a.role]}`,
          filters: [roleFilter_],
        })
      const suspendedList = accountArchive("admin:archive-flagged", suspended)
      const deactivatedList = accountArchive("admin:archive-deactivated", deactivated)
      return (
        <>
          {pageHeading(
            "Archive",
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
                <ListSection
                  list={suspendedList}
                  placeholder="Search flagged accounts"
                  noun="account"
                  empty={null}
                  render={(items) => (
                <>
                {items.map((a) => (
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
                </>
                  )}
                />
                <h3>Deactivated accounts</h3>
                <ListSection
                  list={deactivatedList}
                  placeholder="Search deactivated accounts"
                  noun="account"
                  empty={null}
                  render={(items) => (
                <>
                {items.map((a) => (
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
                </>
                  )}
                />
                {!suspended.length && !deactivated.length && (
                  <Empty title="No accounts require review" />
                )}
              </div>
            ) : (
              <ListSection
                list={archiveList}
                placeholder="Search archived projects"
                noun="record"
                render={(items) => projectTable(items)}
                empty={projectTable([])}
              />
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
                    disabled={notificationSettings.pending}
                    onChange={() => notificationSettings.toggleMute(type)}
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
                Accounts and records are saved to the database. Account access
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
        {!docsOnly && <><Button icon="doc" onClick={()=>setReportProjectId(p.id)}>Monthly report</Button><IntakeGuidance state={state} project={p} actor={actor} details /></>}
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
            <OverallProjectProgress name={p.name} verifiedProgress={p.verifiedProgress} />
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
              {(() => {
                const li = state.license?.overview?.find((i) => i.id === p.opmId)
                const asg = li?.assignments.find((x) => x.projectId === p.id && x.role === "opm")
                return li?.restricted && asg ? <PhaseLicenseFlag item={li} assignment={asg} onOverride={setOverrideTarget} /> : null
              })()}
              <LicenseAssignmentWarning expiry={state.accounts.find((a) => a.id === p.opmId)?.expiry} projectEnd={p.end} />
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
                    <span>
                      {t.accountId ? nameFor(t.accountId) : "Unassigned"}
                      <LicenseAssignmentWarning expiry={state.accounts.find((a) => a.id === t.accountId)?.expiry} projectEnd={p.end} />
                    </span>
                    <Status status={t.accountId ? t.status : "unassigned"} />
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
                              {p.end && c.account.expiry && c.account.expiry < p.end
                                ? ` · license expires ${dateLabel(c.account.expiry)}`
                                : ""}
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
                    {(() => {
                      const li = state.license?.overview?.find((i) => i.id === t.accountId)
                      const asg = li?.assignments.find((x) => x.projectId === p.id && x.role === "spm" && x.stage?.toLowerCase() === t.phase.toLowerCase())
                      return li?.restricted && asg ? <PhaseLicenseFlag item={li} assignment={asg} onOverride={setOverrideTarget} /> : null
                    })()}
                  </div>
                ))}
              </div>
            </section>
            <EngineerHistory projectId={p.id} />
            <section className="detail-section">
              <h3>Site photo gallery</h3>
              <SitePhotoGallery photos={p.workflow?.photos || []} onPreview={previewDoc}
                onRelease={p.status !== "completed" ? async photoId => {
                  const result = await sendWorkflow({ type: "release_photo", projectId: p.id, photoId })
                  if (!result.ok) throw new Error(result.error || "Photo release failed. Try again.")
                } : undefined} />
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
                <ProjectProgress key={p.id} project={{ ...p, phases: projectPhaseNames(p) }} />
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
              {["opm", "spm"].includes(a.role) && <div>
                <small>PROJECT EXPERIENCE</small>
                {EXPERIENCE_PROJECT_TYPES.map(type => <p key={type}>{experienceText(a.experienceByType, type)}</p>)}
              </div>}
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
                </div>
                <Button
                  disabled={a.status === "deactivated"}
                  icon="upload"
                  onClick={() => setDialog({ kind: "license", id: a.id })}
                >
                  {a.license ? "Renew license" : "Add license"}
                </Button>
              </div>
              <LicenseProfileBlock
                item={state.license?.overview?.find((i) => i.id === a.id)}
                reviewing={Boolean(a.renewalUnderReview)}
                onOverride={setOverrideTarget}
                onReview={() => setRenewalsOpen(true)}
              />
              {a.certifications && (
                <div className="tag-list subsection">
                  {a.certifications.map((cert) => (
                    <span key={cert}>{cert}</span>
                  ))}
                </div>
              )}
              <p className="muted">
                Renewal reminders are sent automatically when a license is
                missing, expiring or expired.
              </p>
            </section>
            <WorkRecord userId={a.id} />
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
  if (signedOut && checkingSession) return <WorkspaceSkeleton role={loadingWorkspaceRole} />
  if (signedOut && restoreError)
    return (
      <main className="session-restore" aria-busy={checkingSession}>
        {checkingSession ? null : (
          <div role="alert">
            <p>{restoreError}</p>
            <div className="session-restore-actions">
              <Button variant="primary" onClick={() => setRestoreAttempt((n) => n + 1)}>
                Retry
              </Button>
              <Button onClick={() => { setRestoreError(""); endSession() }}>Sign out</Button>
            </div>
          </div>
        )}
      </main>
    )
  if (signedOut || !actor.id)
    return <LoginPage onSignIn={signIn} workspaceRole={loadingWorkspaceRole} sessionMessage={sessionMessage} />
  if(mustResetPassword)return <PasswordReset onComplete={()=>setMustResetPassword(false)} onCancel={endSession} />
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
        onMute={notificationSettings.toggleMute}
        onRead={ids => notificationSettings.markRead(ids, true)}
        notificationSave={notificationSettings}
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
        welcomeGreeting={welcomeGreeting}
        onCommand={sendWorkflow}
        onReload={reloadWorkspace}
        onRead={notificationSettings.markRead}
        onMute={notificationSettings.toggleMute}
        notificationSave={notificationSettings}
        paused={signedOut}
        idleWarning={idleWarning}
        onStayActive={() => setIdleWarning(false)}
        onResume={endSession}
        onPause={endSession}
      />
    )
  const navigationCounts = navigationAttention(state, actor)
  return (
    <div className={`app-shell admin-workspace ${navigation.expanded ? "sidebar-expanded" : "sidebar-collapsed"}`}>
      <aside id="admin-navigation" ref={navigation.sidebarRef} className="sidebar" aria-label="Administrator navigation" aria-hidden={!navigation.expanded} inert={!navigation.expanded}>
        <div className="workspace-switch">
          <span className="workspace-avatar">10</span>
          <span>
            <strong>10 Builders</strong>
            <small>Administrator workspace</small>
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
        {navigation.compact && <Button className="admin-nav-close" variant="icon-button" icon="close" aria-label="Close navigation" onClick={navigation.closeMobile} />}
        <nav aria-label="Main navigation">
          {NAV.map((n) => (
            <div key={n.label}>
              {n.group && <div className="nav-group-label">{n.group}</div>}
              <button
                aria-label={n.label}
                aria-description={navigationCounts[n.label]?.count ? `${navigationCounts[n.label].count} ${navigationCounts[n.label].description}` : undefined}
                className={`nav-item ${page === n.label ? "active" : ""}`}
                onClick={() => navigate(n.label)}
              >
                <Icon name={n.icon} size={19} />
                <span>{n.label}</span>
                <NavigationCount item={navigationCounts[n.label]} />
                {n.label === "Dashboard" && page === n.label && <i />}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button onClick={() => { navigation.closeMobile(); setDialog({ kind: "help" }) }}>
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
              onClick={() => {
                navigation.closeMobile()
                setConfirmation({
                  title: "Sign out?",
                  message:
                    "Your records will be available when you sign in again.",
                  action: endSession,
                })
              }}
            />
          </div>
        </div>
      </aside>
      {navigation.compact && navigation.expanded && (
        <button
          className="mobile-nav-backdrop admin-nav-backdrop"
          aria-label="Close navigation backdrop"
          tabIndex={-1}
          onClick={navigation.closeMobile}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <Button
              ref={navigation.toggleRef}
              className="sidebar-toggle"
              variant="icon-button"
              icon={navigation.expanded ? "close" : "menu"}
              aria-label={navigation.expanded ? navigation.compact ? "Close navigation" : "Collapse navigation" : navigation.compact ? "Open navigation" : "Expand navigation"}
              aria-expanded={navigation.expanded}
              aria-controls="admin-navigation"
              onClick={navigation.toggle}
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
                      onClick={() => notificationSettings.markRead(state.events.map(event => event.id))}
                    >
                      Mark all read
                    </Button>
                  </div>
                  <NotificationMessages
                    key={actor.id}
                    items={state.events.filter(e => !state.muted.includes(e.type) && ["request", "approval", "progress", "notice"].includes(e.type))}
                    renderItems={items => activityList(items, true)}
                    empty={activityList([], true)}
                  />
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
          <NotificationSaveStatus {...notificationSettings} />
          <div className={page === "Dashboard" && welcomeGreeting ? "workspace-meta has-greeting" : "workspace-meta"}>
            {page === "Dashboard" && <DashboardWelcome greeting={welcomeGreeting} />}
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
          wide
          onClose={() => setDialog(undefined)}
        >
          <IntakeForm
            state={state}
            project={selectedProject}
            onClose={() => setDialog(undefined)}
            onSubmit={addProject}
            onClient={saveClient}
          />
        </Modal>
      )}
      {dialog?.kind === "sent" && selectedProject && (
        <Modal
          title="Project handed off successfully"
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
      {overrideTarget && (
        <OverrideDialog
          target={overrideTarget}
          onClose={() => setOverrideTarget(undefined)}
          onDone={async () => {
            setOverrideTarget(undefined)
            await reloadWorkspace()
            setToast("Reassignment requested. Nothing moves until the replacement accepts.")
          }}
        />
      )}
      {renewalsOpen && (
        <Modal title="License renewals" subtitle="Verify or reject uploaded licenses." onClose={() => setRenewalsOpen(false)} wide>
          <RenewalQueue
            renewals={state.license?.renewals || []}
            onChanged={async () => {
              await reloadWorkspace()
              setToast("Renewal reviewed.")
            }}
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
          wide
          onClose={() => setDialog(undefined)}
        >
          {companyDetails(selectedCompany)}
        </Modal>
      )}
      {dialog?.kind === "add-company" && (
        <Modal
          title="Add subcontractor company"
          wide
          onClose={() => setDialog(undefined)}
        >
          <CompanyForm
            owner={admin.name}
            onClose={() => setDialog(undefined)}
            onSave={async(company)=>{
              try{const saved=await createCompany(company);await reloadWorkspace();setDialog({kind:"company",id:saved.id});setToast("Company added")}
              catch(error){setToast((error as Error).message)}
            }}
          />
        </Modal>
      )}
      {dialog?.kind === "search" && (
        <Modal
          title="Search workspace"
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
              Records and uploads are saved through the server to the database.
              Access follows your account role and project assignments.
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
      {reportProjectId && <MonthlyReport projects={state.projects} initialProjectId={reportProjectId} onClose={()=>setReportProjectId("")} />}
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
            Shown once in this session. Share this temporary password with the
            account owner. They must choose a new password after signing in.
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
      {selectedNotification && <NotificationDetail notification={selectedNotification} saveState={notificationSettings}
        action={notificationAction(selectedNotification, actor, state.projects, state.accounts, [...NAV.map(item => item.label), "Approvals", "Project documents", "Engineer documents", "Engineer directory", "Subcon directory"])}
        onClose={() => setSelectedNotification(undefined)} onOpen={action => {
          setSelectedNotification(undefined)
          if (action.kind === "project") setDialog({ kind: "project", id: action.id })
          else if (action.kind === "account") setDialog({ kind: "account", id: action.id })
          else if (action.kind === "page") {
            setDialog(undefined)
            if (action.page === "Approvals") openPendingRequests()
            else navigate(action.page)
          }
        }} />}
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
  return <AppInner />
}

import { resolveAdminSearchDestination, type AdminSearchDestination } from "./admin-search-destination"
import type { WorkspaceResult } from "./admin-workspace-search"
import "./admin-search-destination.css"
import AdminWorkspaceSearch from "./AdminWorkspaceSearch"
import { requiresRenewalOnlyAccess } from "./renewal-only";
import EngineerResponsibilities from './EngineerResponsibilities'
import AdminProjectDocuments from "./AdminProjectDocuments"
import "./company-created-notice.css"
import SitePmAppointmentAgreements, { appointmentStaff, appointmentFor } from "./SitePmAppointmentAgreements"
import AdminAccountSecurity,{AdminRecoveryNotice} from './AdminAccountSecurity'
import ShareLoginLinks from "./ShareLoginLinks"
import AccountSignInDetails, { type CreatedAccountDetails } from "./AccountSignInDetails"
import IntakeRecord from "./IntakeRecord"
import AdminIntakeCards from "./AdminIntakeCards"
import ArchiveProjectCards from "./ArchiveProjectCards"
import InfoPopover from "./InfoPopover"
import useIdleWarning from "./useIdleWarning"
import {engineerAvailabilityLabel} from './model'
import CollapsibleSidebarNav from "./CollapsibleSidebarNav";
import EngineerCredentials from "./EngineerCredentials";
import RestrictedRenewalPage from "./RestrictedRenewalPage";
import ProjectMonitoringOverview from "./ProjectMonitoringOverview";
import ActionFeedback, { useActionMessage } from "./ActionFeedback"
import useSwipeNavigation from "./useSwipeNavigation"
import ProjectScopeSummary from "./ProjectScopeSummary"
import ExtensionWorkflow from "./ExtensionWorkflow"
import useSidebarNavigation from "./useSidebarNavigation"
import useWorkspacePage from "./useWorkspacePage"
import { changeRoute, ROUTE_CHANGE } from "./workspace-routing"
import useSignOutConfirmation from "./useSignOutConfirmation"
import useLoginBackConfirmation from "./useLoginBackConfirmation"
import UrgentActionBanner from "./UrgentActionBanner"
import { adminBannerItem, adminPriorityItems, type UrgentItem } from "./urgent-actions"
import { ProjectScheduleDetails, useScheduleToday } from "./ScheduleStatus"
import { delayedProjects } from "./domain/schedule-status"
import { currentPhaseStatus, hasUnapprovedCorrectedEvidence } from "./domain/current-phase-status"
import { licenseAccessPolicy } from "../Thesis-Backend/src/domain/license-access.js"
import PasswordResetRequests from "./PasswordResetRequests"
import AdminDashboard from "./AdminDashboard"
import Backups from "./Backups"
import PageTitlePanel from "./PageTitlePanel"
import DashboardWelcome from "./DashboardWelcome"
import NotificationDetail from "./NotificationDetail"
import NotificationMessages from "./NotificationMessages"
import { EXPERIENCE_PROJECT_TYPES, experienceText } from "../Thesis-Backend/src/domain/engineer-experience.js"
import { PROFESSIONS } from "../Thesis-Backend/src/domain/engineer-credentials.js"
import { notificationAction } from "./notification-action"
import SitePhotoGallery from "./SitePhotoGallery"
import useNotificationSettings, { NotificationSaveStatus } from "./useNotificationSettings"
import { sessionDashboardGreeting, type LoginGreeting } from "./dashboard-greeting"
import IntakeGuidance, { AdminIntakeTable, IntakeTabs } from "./IntakeGuidance"
import { intakeGuidance, intakeViewCounts, isIntakeHistory, type IntakeView } from "./intake-guidance"
import WorkspaceSkeleton from "./LoadingSkeleton"
import { clearStoredAccountPreferences, clearStoredWorkspaceData } from "./browser-data"
import { createInFlight } from "./api/in-flight"
import { navigationAttention } from "./navigation-attention"
import { adminDashboardOverview } from "./admin-dashboard"
import ProjectProgress from "./ProjectProgress"
import { hasPendingSiteReview } from "./active-sites-review"
import ActiveSites from "./ActiveSites"
import { leadId } from "./workflows"
import PasswordReset from "./PasswordReset"
import { createCompany, persistAdminChanges, saveApiAccount, saveApiProject, PartialProjectSave, sendApiWorkflow } from "./api/actions"
// @refresh reset
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react"
import { applyRefreshSetting, isStale, startPolling } from "./refresh-interval"
import { flushSync } from "react-dom"
import MonthlyReport from "./MonthlyReport"
import MonthlySummaryDialog from "./MonthlySummaryDialog"
import RoleWorkspace from "./RoleWorkspace"
import LoginPage from "./LoginPage"
import { canonicalizeLoginEntry, currentLoginPortal, loginPortalForRole, loginPath, isLandingPath, navigateToWorkspace, type LoginPortal } from "./login-portal"
import { roleAllowedOnHost } from "./portal-domain"
import { SIGN_IN_MESSAGES, guardedSignIn, localAttemptStore } from "./signInPolicy"
import { assertCanSignIn } from "./auth"
import { stubAccount } from "./api/adapter"
import {
  api,
  ApiError,
  getToken,
  setToken,
  SESSION_REPLACED_EVENT,
  LICENSE_RENEWAL_ONLY_EVENT,
  login as apiLogin,
  logout as apiLogout,
  tokenUser,
} from "./api/client"
import { loadState as loadApiState } from "./api/load"
import { ClientSubconAdminCard } from "./ClientSubconReview"
import ClientPortal from "./ClientPortal"
import CompanyCapabilities from "./CompanyCapabilities"
import CompanyRemovalActions from "./CompanyRemovalActions"
import CompanyForemen from "./CompanyForemen"
import AllocationDirectory, { CompanyProjectPhases } from "./AllocationDirectory"
import { TradeAllocationOverview } from "./TradeAllocationPanel"
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
  checklistFor,
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
  withFilter,
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
  useEffect(() => {
    clearStoredWorkspaceData()
    if (!getToken()) clearStoredAccountPreferences()
  }, [])
  const scheduleToday = useScheduleToday()
  const [activeSitesScheduleFilter, setActiveSitesScheduleFilter] = useState<"" | "delayed">("")
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
  const lastLoadAt = useRef(Date.now())
  stateRef.current = state
  const actor =
    state.accounts.find((a) => a.id === sessionId) ||
    stubAccount("", "", "client")
  const { page, navigate: setPage } = useWorkspacePage("admin")
  const [intakeView, setIntakeView] = useState<IntakeView>("all")
  const [intakeLogTab, setIntakeLogTab] = useState<"current" | "history">("current")
  const [dialog, setDialog] = useState<Dialog>()
  const [securityOpen,setSecurityOpen]=useState(false)
  const [shareLoginLinksOpen, setShareLoginLinksOpen] = useState(false)
  const [securityTab,setSecurityTab]=useState<'password'|'codes'>('codes')
  const [projectHistoryPage, setProjectHistoryPage] = useState(1)
  const [preview, setPreview] = useState<Doc>()
  const [documentFolderProjectId, setDocumentFolderProjectId] = useState("")
  const [appointmentFolderProjectId, setAppointmentFolderProjectId] = useState("")
  useEffect(() => { setDocumentFolderProjectId(""); setAppointmentFolderProjectId("") }, [dialog?.kind, dialog?.id])
  const [reportProjectId,setReportProjectId]=useState("")
  const [monthlySummaryOpen, setMonthlySummaryOpen] = useState(false)
  const [toast, setToast] = useState("")
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("all")
  const [searchLanding, setSearchLanding] = useState<AdminSearchDestination>()
  const [projectRepositoryPath, setProjectRepositoryPath] = useState<{ projectId?: string; categoryId?: string; folderId?: string }>({})
  useEffect(() => { setSearchLanding(undefined); setProjectRepositoryPath({}) }, [actor.id])
  const [subconTab, setSubconTab] = useState("registered")
  const [companyCreatedNotice, setCompanyCreatedNotice] = useState<{ id: string; name: string; verified: boolean; refreshRequired?: boolean }>()
  const [documentsTab, setDocumentsTab] = useState<DocumentsTab>("project")
  const [directoryTab, setDirectoryTab] = useState<DirectoryTab>("engineers")
  const [tab, setTab] = useState("closed")
  const [notifications, setNotifications] = useState(false)
  const [selectedNotification, setSelectedNotification] = useState<Event>()
  const [credentials, setCredentials] = useState<CreatedAccountDetails>()
  const [confirmation, setConfirmation] = useState<{
    title: string
    message: string
    action: () => void
    destructive?: boolean
  }>()
  const [signedOut, setSignedOut] = useState(true)
  const [signingOut, setSigningOut] = useState(false)
  const signOutInFlight = useRef(false)
  const [loginPortal, setLoginPortal] = useState<LoginPortal>(currentLoginPortal)
  const [routePath, setRoutePath] = useState(canonicalizeLoginEntry)
  useEffect(() => {
    const changed = () => {
      canonicalizeLoginEntry()
      setRoutePath(window.location.pathname)
      setLoginPortal(currentLoginPortal())
      setDialog(undefined)
      setPreview(undefined)
      setConfirmation(undefined)
      setNotifications(false)
      setSelectedNotification(undefined)
      setSecurityOpen(false)
      setShareLoginLinksOpen(false)
      setMonthlySummaryOpen(false)
      setReportProjectId("")
      setOverrideTarget(undefined)
      setRenewalsOpen(false)
    }
    window.addEventListener("popstate", changed)
    window.addEventListener(ROUTE_CHANGE, changed)
    return () => {
      window.removeEventListener("popstate", changed)
      window.removeEventListener(ROUTE_CHANGE, changed)
    }
  }, [])
  useEffect(() => {
    document.title = loginPortal === "admin" ? "10BuildLine Admin | 10 Builders" : loginPortal === "staff" ? "10BuildLine Staff | 10 Builders" : "10BuildLine | 10 Builders"
  }, [loginPortal])
  const navigation = useSidebarNavigation(!signedOut && !isLandingPath(routePath) && actor.role === "admin")
  useEffect(() => {
    if (signedOut) return
    const portal = loginPortalForRole(actor.role)
    setRoutePath(navigateToWorkspace(actor.role))
    setLoginPortal(portal)
  }, [signedOut, actor.role, loginPortal, routePath])
  const notificationSettings = useNotificationSettings(actor.id, stateRef, setState, signedOut)
  const [resetRequestFocus,setResetRequestFocus]=useState(0)
  const [sessionMessage, setSessionMessage] = useState("")
  const [welcomeGreeting, setWelcomeGreeting] = useState<LoginGreeting>()
  const [checkingSession, setCheckingSession] = useState(true)
  const [loadingWorkspaceRole, setLoadingWorkspaceRole] = useState<Account["role"]>()
  const [readinessAvailable, setReadinessAvailable] = useState(false)
  const [mustResetPassword,setMustResetPassword]=useState(false)
  const { idleWarning, stayActive } = useIdleWarning(!signedOut, state.rules.idle, () => { void endSession() }, getToken())
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
  useEffect(() => setProjectHistoryPage(1), [selectedProject?.id])
  const selectedAccount = state.accounts.find((a) => a.id === dialog?.id)
  const selectedCompany = state.companies.find((c) => c.id === dialog?.id)

  // Saved sessions are verified even at login, so authenticated users never see
  // the login form. Only a rejected token or an
  // account that may no longer sign in ends the session; a server or network
  // hiccup keeps the token and offers a retry instead of the login page.
  const [restoreError, setRestoreError] = useState("")
  useEffect(() => {
    if (!signedOut || checkingSession || restoreError || isLandingPath(routePath)) return
    const portal = currentLoginPortal()
    changeRoute(loginPath(portal), true, { loginPortal: portal, returnTo: routePath })
  }, [signedOut, checkingSession, restoreError, routePath])
  const [restoreAttempt, setRestoreAttempt] = useState(0)
  const sessionRestore = useRef(createInFlight<Account>())
  const sessionLoadVersion = useRef(0)
  useEffect(() => {
    const returned = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      sessionRestore.current.clear()
      sessionLoadVersion.current += 1
      // A cached document does not remount React. Hide its old login/workspace
      // immediately, then verify the current tab's session before displaying it.
      flushSync(() => {
        setSignedOut(true)
        setCheckingSession(true)
        setRestoreError("")
        setRestoreAttempt(attempt => attempt + 1)
      })
    }
    window.addEventListener("pageshow", returned)
    return () => window.removeEventListener("pageshow", returned)
  }, [])
  const signOut = useSignOutConfirmation(() => { setRestoreError(""); endSession() })
  useLoginBackConfirmation(!signedOut && !signingOut && !checkingSession && !mustResetPassword, actor.id, signOut.request)
  const swipe = useSwipeNavigation({identity:actor.id,page,allowedPages:NAV.map(item=>item.label),enabled:!signedOut && !checkingSession && !mustResetPassword && !isLandingPath(routePath) && actor.role==='admin',blocked:navigation.compact && navigation.expanded,navigate})
  useEffect(() => {
    const storedUser = tokenUser()
    if (!storedUser) {
      if (getToken()) setToken("")
      setCheckingSession(false)
      return
    }
    // A decoded role may reject a session early; /auth/me still verifies every
    // session that is restored. Never load another portal's workspace here.
    if (!roleAllowedOnHost(storedUser.role, window.location.hostname)) {
      setToken("")
      changeRoute("/", true)
      setCheckingSession(false)
      return
    }
    let cancelled = false
    setCheckingSession(true)
    setRestoreError("")
    const token = getToken()
    sessionRestore.current.run(token, () =>
      api<Parameters<typeof startApiSession>[0]>("/auth/me").then(user => {
        if (getToken() !== token) throw new ApiError("Your session has changed. Sign in again.", 401)
        return startApiSession(user)
      }),
    )
      .then((account) => {
        if (cancelled) return
        setSessionId(account.id)
        setWelcomeGreeting(account.role === "client" ? undefined : sessionDashboardGreeting(account.id, account.name))
        setSignedOut(false)
      })
      .catch((error) => {
        if (cancelled || (getToken() && getToken() !== token)) return
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
    // The session check is tiny but runs on every screen, so it waits a minute between checks.
    const timer = window.setInterval(check, 60000)
    window.addEventListener("focus", check)
    document.addEventListener("visibilitychange", check)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", check)
      document.removeEventListener("visibilitychange", check)
    }
  }, [signedOut])
  useActionMessage(toast, () => setToast(""))
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
    lastLoadAt.current=Date.now()
    setState(loaded)
    setReadinessAvailable(true)
    return loaded
  }
  // Every timer follows the Administrator's data refresh setting (default 5 minutes).
  useEffect(() => { applyRefreshSetting(state.rules) }, [state.rules?.refreshSeconds])
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
        lastLoadAt.current = Date.now()
      } catch { if(active)setReadinessAvailable(false) /* A failed read does not assert current blockers. */ }
      finally { loading = false }
    }
    const stopPolling = startPolling(refresh)
    // Coming back to a tab that sat idle for a full interval catches up at once. Quick switches do not reload.
    const onFocus = () => { if (isStale(lastLoadAt.current)) void refresh() }
    const onRestricted = () => { loading = false; void refresh() }
    window.addEventListener(LICENSE_RENEWAL_ONLY_EVENT, onRestricted)
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onFocus)
    return () => { active = false; stopPolling(); window.removeEventListener(LICENSE_RENEWAL_ONLY_EVENT, onRestricted); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus) }
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
    setSearchLanding(undefined)
    if (next === "Reports") { setMonthlySummaryOpen(true); return }
    setActiveSitesScheduleFilter("")
    const target = resolveAdminTarget(next)
    setPage(target ? target.page : normalizeWorkspacePage(next))
    resetListState()
    if (target?.documentsTab) setDocumentsTab(target.documentsTab)
    if (target?.directoryTab) setDirectoryTab(target.directoryTab)
    if (target?.subconTab) setSubconTab(target.subconTab)
    navigation.closeMobile()
    setNotifications(false)
  }
  function focusSearchItems<T extends { id: string }>(items: T[], key: string): T[] {
    return searchLanding?.listKey === key ? items.filter(item => item.id === searchLanding.recordId) : items
  }
  function openSearchResult(result: WorkspaceResult) {
    if (actor.role !== "admin") return
    const destination = resolveAdminSearchDestination(state, result)
    if (!destination) { setToast("This record is no longer available. Refresh your search."); return }
    navigate(destination.page)
    if (destination.directoryTab) setDirectoryTab(destination.directoryTab)
    if (destination.documentsTab) setDocumentsTab(destination.documentsTab)
    if (destination.subconTab) setSubconTab(destination.subconTab)
    if (destination.archiveTab) setTab(destination.archiveTab)
    if (destination.page === "Project intake") { setIntakeLogTab("current"); setIntakeView("all") }
    setProjectRepositoryPath(destination.repositoryPath || {})
    updateListQuery(destination.listKey, query => ({ ...query, search: "", filters: {}, page: 1 }))
    if (destination.repositoryPath) updateListQuery(`admin:documents:files:${destination.recordId}:${destination.repositoryPath.folderId}`, query => ({ ...query, search: "", filters: {}, page: 1 }))
    setSearchLanding(destination)
    if (destination.document) {
      setDialog(destination.recordKind === "company" || (destination.recordKind === "account" && destination.page !== "Documents") ? { kind: destination.dialog, id: destination.recordId } : undefined)
      previewDoc(destination.document)
    } else setDialog({ kind: destination.dialog, id: destination.recordId })
  }
  function selectDocumentsTab(tab: DocumentsTab) {
    setSearchLanding(undefined)
    resetListState()
    setDocumentsTab(tab)
  }
  function selectDirectoryTab(tab: DirectoryTab) {
    setSearchLanding(undefined)
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
    clearStoredAccountPreferences()
    sessionRestore.current.clear()
    sessionLoadVersion.current += 1
    setLoadingWorkspaceRole(undefined)
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
  }, freshLogin = false): Promise<Account> {
    if (!roleAllowedOnHost(user.role, window.location.hostname)) {
      setToken("")
      changeRoute("/", true)
      throw new ApiError("This account cannot access this portal. Sign in with an account for this portal.", 403)
    }
    const requestToken = getToken()
    const version = ++sessionLoadVersion.current
    setLoadingWorkspaceRole(user.role)
    setReadinessAvailable(false)
    try {
      setMustResetPassword(!!(user as {temp_password_issued?:boolean}).temp_password_issued)
      const loaded = await loadApiState(user)
      if (getToken() !== requestToken || version !== sessionLoadVersion.current) {
        throw new ApiError("Your session has changed. Sign in again.", 401)
      }
      const account = loaded.accounts.find((a) => a.id === user.id)
      try {
        if (!account) throw new Error(ACCOUNT_UNAVAILABLE_MESSAGE)
        assertCanSignIn(loaded, account)
        if (!roleAllowedOnHost(account.role, window.location.hostname)) throw new ApiError("This account cannot access this portal.", 403)
      } catch (error) {
        await apiLogout()
        throw error
      }
      stateRef.current = loaded
      setState(loaded)
      setReadinessAvailable(true)
      const portal = loginPortalForRole(account.role)
      if (!freshLogin) setRoutePath(navigateToWorkspace(account.role))
      setLoginPortal(portal)
      return account
    } finally {
      if (version === sessionLoadVersion.current) setLoadingWorkspaceRole(undefined)
    }
  }
  async function signIn(email: string, password: string, replaceSession = false) {
    const account: Account = await guardedSignIn(signInAttempts,email,async()=>{
    let user: Awaited<ReturnType<typeof apiLogin>>
    try {
      user = await apiLogin(email, password, replaceSession, loginPortal)
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
      account = await startApiSession(user, true)
    } catch (error) {
      await apiLogout()
      throw error
    }
      return account
    })
    setRoutePath(navigateToWorkspace(account.role, true))
    setLoginPortal(loginPortalForRole(account.role))
    setDialog(undefined)
    setPreview(undefined)
    setConfirmation(undefined)
    setCredentials(undefined)
    setCompanyCreatedNotice(undefined)
    setNotifications(false)
    setSelectedNotification(undefined)
    setSessionId(account.id)
    setSessionMessage("")
    setWelcomeGreeting(account.role === "client" ? undefined : sessionDashboardGreeting(account.id, account.name, { fresh: true }))
    setSignedOut(false)
    try {
      sessionStorage.setItem(SESSION_KEY, account.id)
    } catch {
      /* The session remains in memory until the tab closes. */
    }
  }
  async function endSession() {
    if (signOutInFlight.current) return
    signOutInFlight.current = true
    signOut.cancel()
    setSigningOut(true)
    const portal = currentLoginPortal()
    changeRoute(loginPath(portal), true, { loginPortal: portal })
    setRoutePath(window.location.pathname)
    setLoginPortal(portal)
    clearSession()
    setSelectedNotification(undefined)
    setCredentials(undefined)
    setCompanyCreatedNotice(undefined)
    setWelcomeGreeting(undefined)
    setSignedOut(true)
    setSessionId("")
    const revocation = apiLogout()
    const empty = emptyState()
    stateRef.current = empty
    setState(empty)
    const serverConfirmed = await revocation
    if (!serverConfirmed) setSessionMessage("You are signed out on this device, but the server could not confirm logout. Your server session may remain active until it expires.")
    signOutInFlight.current = false
    setSigningOut(false)
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
      if(!exists&&saved.password)setCredentials({name:account.name,email:saved.email,password:saved.password,role:account.role,credentialDecision:account.credentialDecision})
      setToast(exists?"Account updated":"Account created")
    }catch(error){setToast((error as Error).message);throw error}
  }
  async function saveClient(account:Account) {
    const saved=await saveApiAccount(account,false)
    const loaded=await reloadWorkspace()
    if(saved.password)setCredentials({name:account.name,email:saved.email,password:saved.password,role:"client"})
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
    if (status === "approved" && !c.capabilityReview?.reviewedAt) {
      setDialog({kind:"company",id:c.id}); setToast("Complete Admin capability verification to approve this company."); return
    }
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
    if (a.role !== "spm") return
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
  const intakeHistory = state.projects.filter(isIntakeHistory)
  const intakeItems = intakeLogTab === "history" ? intakeHistory : state.projects.filter((p) =>
    ["pending", "changes_requested", "draft"].includes(p.status),
  )
  const intakeCounts = intakeViewCounts(intakeItems, p => intakeGuidance(state, p, actor))
  const intakeList = runList(intakeLogTab === "history" ? "admin:intake-history" : "admin:intake", focusSearchItems(intakeItems.filter(p => intakeLogTab === "history" || intakeView === "all" || intakeGuidance(state, p, actor)?.kind === intakeView), intakeLogTab === "history" ? "admin:intake-history" : "admin:intake"), {
    searchText: projectSearch,
    filters: [
      {
        id: "status",
        label: "Status",
        allLabel: "All intake",
        options: intakeLogTab === "history" ? [
          { value: "active", label: "Project Active" },
          { value: "completed", label: "Project Completed" },
        ] : [
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
      {
        id: "credentials",
        label: "Professional credentials",
        allLabel: "All credential records",
        options: [{ value: "missing", label: "Not on file" }],
        test: (a: Account, value: string) => value !== "missing" || (["opm", "spm"].includes(a.role) && a.hasProfessionalCredentials === false && ["active", "invited"].includes(a.status)),
      },
    ],
  }
  const engineerPath = engineerQueryString(getListQuery("admin:engineers"))
  const engineersOnServer = engineerPath !== undefined && searchLanding?.listKey !== "admin:engineers"
  const serverEngineers = useAccountsPage({
    queryString: engineerPath,
    enabled: page === "Directory" && directoryTab === "engineers" && engineersOnServer,
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
        stableSort(focusSearchItems(engineers, "admin:engineers"), (a, b) => a.name.localeCompare(b.name), (a) => a.id),
        engineersConfig,
      )
  const engineerDocsList = runList("admin:engineer-docs", focusSearchItems(engineers, "admin:engineer-docs"), {
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
    focusSearchItems(state.companies.filter((c) => c.status === "approved"), "admin:companies"),
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
    focusSearchItems(state.accounts.filter((a) => a.status !== "deactivated"), "admin:team"),
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
      focusSearchItems(state.companies.filter((c) => c.status === status), `admin:subcon-${status}`),
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
              className={searchLanding?.recordId === c.id ? "search-result-highlight" : undefined}
              actions={<Badge tone={c.status === "pending" ? "amber" : c.status === "approved" ? "green" : "gray"}>{c.status === "pending" ? "Pending Admin verification" : c.status}</Badge>}
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
      delayedCount={delayedProjects(active, scheduleToday).length}
      onDelayedProjects={() => { navigate("Active sites"); setActiveSitesScheduleFilter("delayed") }}
      readinessAvailable={readinessAvailable}
      overview={adminDashboardOverview(state)}
      resetRequests={requests}
      onOpenReset={openReset}
      onCompletedProjects={() => {navigate("Archive");setTab("closed")}}
      resetRequestFocus={resetRequestFocus}
      onNavigate={navigate}
      onNewIntake={() => setDialog({ kind: "intake" })}
      onMonthlyReport={() => setMonthlySummaryOpen(true)}
      onActivity={() => navigate("Activity log")}
      onOpen={item => item.key.startsWith("password-reset:") ? openReset(item.id) : item.key.startsWith("license-cover:") ? openLicenseCover(item.id) : item.key.startsWith("license-renewal:") ? setRenewalsOpen(true) : setDialog({ kind: item.kind, id: item.id })}
      activity={<>{activityList(dashActivity.view.items, true)}<CompactPager list={dashActivity} /></>}
    />}</PasswordResetRequests>
  }
  function openAdminPriority(item: UrgentItem) {
    const source = adminDashboardOverview(state).items.find(entry => entry.key === item.key)
    if (!source) return
    if (source.key.startsWith("license-cover:")) openLicenseCover(source.id)
    else if (source.key.startsWith("license-renewal:")) setRenewalsOpen(true)
    else setDialog({ kind: source.kind, id: source.id })
  }
  function pageHeading(title: string, action?: ReactNode) {
    return (
      <>
      <PageTitlePanel title={title}>
        {action}
      </PageTitlePanel>
      <UrgentActionBanner items={adminPriorityItems(adminDashboardOverview(state).items, page, readinessAvailable).map(adminBannerItem)} onOpen={openAdminPriority} actionLabel="Open priority item" />
      </>
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
    if (page === "Dashboard") return dashboard()
    if (page === "Active sites")
      return (
        <>
          {pageHeading(
            "Active sites",
          )}
          <ExtensionWorkflow actor={actor} />
          <ActiveSites focusedId={searchLanding?.recordKind === "project" ? searchLanding.recordId : undefined} key={`${actor.id}:${activeSitesScheduleFilter}:${searchLanding?.recordId || ""}`} initialScheduleFilter={activeSitesScheduleFilter} today={scheduleToday} phaseDefinitionsByType={state.backendPhases} reviewAvailable projects={active.map(p => {
            const assigned = p.team.find(member => member.phase === p.phase)
            const assignedSpm = state.accounts.find(account => account.id === assigned?.accountId)
            const activities = checklistFor(p)
            const reassignmentAwaitingAcceptance = Boolean(assigned?.status === "pending" && state.events.some(event => event.projectId === p.id && event.title === "Phase assignment reassigned" && event.detail.startsWith(`${p.phase} ·`)))
            return {
              ...p,
              lead: state.accounts.find(a => a.id === leadId(p))?.name,
              needsReview: hasPendingSiteReview(p),
              currentPhaseStatus: currentPhaseStatus({
                projectStatus: p.status,
                targetCompletionDate: p.end,
                activities,
                assignedSitePmActionsPaused: assignedSpm ? Boolean(assignedSpm.assignmentHold || licenseAccessPolicy(assignedSpm.expiry, scheduleToday).mode === "view_only") : undefined,
                waitingForReassignedEngineerAcceptance: reassignmentAwaitingAcceptance,
                hasOpenBlockingIssue: Boolean(workflowFor(p).pendingRework?.issues.length),
                hasWithdrawnApprovalAwaitingCorrectedEvidence: hasUnapprovedCorrectedEvidence(p.phase, activities, p.history ?? []),
                today: scheduleToday,
              }),
            }
          })} onOpen={id => setDialog({ kind: "project", id })} />
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
            title="Project Intake Log"
            subtitle={`${intake.length} current intake records · ${intakeHistory.length} completed intake records`}
          >
            <div className="intake-tabs" role="group" aria-label="Intake log view">
              <button type="button" aria-pressed={intakeLogTab === "current"} onClick={() => { setSearchLanding(undefined); setIntakeLogTab("current") }}>Current Intake ({intake.length})</button>
              <button type="button" aria-pressed={intakeLogTab === "history"} onClick={() => { setSearchLanding(undefined); setIntakeLogTab("history") }}>Intake History ({intakeHistory.length})</button>
            </div>
            {intakeLogTab === "current" && <IntakeTabs value={intakeView} counts={intakeCounts} onChange={value => { setIntakeView(value); updateListQuery("admin:intake", q => withPage(q, 1)) }} />}
            <ListSection
              list={intakeList}
              placeholder="Search intake records"
              noun="record"
              render={(items) => intakeLogTab === "history"
                ? <AdminIntakeTable state={state} projects={items} actor={actor} onOpen={p => setDialog({ kind: "intake-record", id: p.id })} onOpenActive={p => { navigate("Active sites"); setDialog({ kind: "project", id: p.id }) }} />
                : <AdminIntakeCards highlightedId={searchLanding?.recordId} state={state} projects={items} actor={actor} onOpen={(p, edit) => setDialog({ kind: edit ? "intake" : "intake-record", id: p.id })} />}
              empty={<Empty title={intakeLogTab === "history" ? "No completed intake records" : !intakeItems.length ? "No intake records" : intakeView === "action" ? "No intake actions for your account" : "No intake records waiting for others"}>{intakeLogTab === "history" ? "Activated projects remain here for reference. Ongoing monitoring is available in Active Sites." : "Existing intake records appear here as projects move through setup."}</Empty>}
            />
          </Panel>
        </>
      )
    const projectDocumentsTab = () => (
        <>
          <DocumentRepository
            key={searchLanding?.document?.id || "repository"}
            focusedFileId={searchLanding?.repositoryPath?.folderId === projectRepositoryPath.folderId ? searchLanding?.document?.id : undefined}
            path={projectRepositoryPath}
            onPathChange={setProjectRepositoryPath}
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
                      className={`folder-card ${searchLanding?.recordId === a.id ? "search-result-highlight" : ""}`}
                      key={a.id}
                      onClick={() =>
                        setDialog({ kind: "engineer-docs", id: a.id })
                      }
                    >
                      <span className="avatar large">{initials(a.name)}</span>
                      <Badge tone={a.eligibleForNewAssignment ? "green" : "amber"}>{a.eligibleForNewAssignment ? "Credential requirements met" : "View credential eligibility"}</Badge>
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
    const accountsMissingCredentials = state.accounts.filter(
      (a) => ["opm", "spm"].includes(a.role) && a.hasProfessionalCredentials === false && ["active", "invited"].includes(a.status),
    )
    const workforceAccounts = state.accounts.filter(
      (a) => ["opm", "spm"].includes(a.role) && ["active", "invited"].includes(a.status),
    )
    function reviewMissingCredentials() {
      updateListQuery("admin:engineers", (query) => withFilter(query, "credentials", "missing"))
      window.requestAnimationFrame(() => document.getElementById("engineer-directory-list")?.scrollIntoView({ behavior: "smooth", block: "start" }))
    }
    const engineersTab = () => (
        <>
          {accountsMissingCredentials.length > 0 && (
            <button className="engineer-credential-banner" type="button" onClick={reviewMissingCredentials}>
              <span className="engineer-credential-banner-icon"><Icon name="alert" size={18} /></span>
              <span className="engineer-credential-banner-copy">
                <strong>{accountsMissingCredentials.length} {accountsMissingCredentials.length === 1 ? "Account Needs" : "Accounts Need"} Credential Review</strong>
                <small>SPM/OPM credentials are not on file. Review them before allocation.</small>
              </span>
              <span className="engineer-credential-banner-action">View Accounts <Icon name="arrow" size={16} /></span>
            </button>
          )}
          <Panel
            title="Workforce by engineer type"
            subtitle="Active and invited SPM/OPM accounts · Informational counts"
            className="engineer-type-summary-panel"
          >
            <div className="engineer-type-summary-grid">
              {PROFESSIONS.map((profession) => {
                const count = workforceAccounts.filter((a) => a.professionalTypes?.includes(profession)).length
                return (
                  <div className="engineer-type-count" key={profession} aria-label={`${count} ${profession}${count === 1 ? "" : "s"}`}>
                    <strong>{count}</strong>
                    <span>{profession.replace(/ Engineer$/, "")}</span>
                  </div>
                )
              })}
            </div>
          </Panel>
          <Panel
            title="In-house personnel"
            subtitle={`${engineers.length} engineers and administrators`}
            className="engineer-directory-personnel"
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
                      className={`engineer-card ${searchLanding?.recordId === a.id ? "search-result-highlight" : ""} ${a.hasProfessionalCredentials === false && ["opm", "spm"].includes(a.role) ? "engineer-needs-credentials" : ""}`}
                      key={a.id}
                      onClick={() => setDialog({ kind: "account", id: a.id })}
                    >
                      <div className="engineer-top">
                        <span className="avatar large">{initials(a.name)}</span>
                        <div className="engineer-identity"><h3>{a.name}</h3><p>{ROLE_NAMES[a.role]}</p></div>
                        <Status status={a.status} />
                      </div>
                      {a.hasProfessionalCredentials === false && ["opm", "spm"].includes(a.role) && (
                        <Badge tone="amber"><Icon name="alert" size={14} />Professional credentials not on file</Badge>
                      )}
                      {a.credentialCount!==undefined&&<p>{a.credentialCount} professional {a.credentialCount===1?'credential':'credentials'} · {a.credentialStatus==='verified'?'Verified':a.credentialStatus==='pending'?'Pending verification':'Review required'}</p>}
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
                          {a.singleProjectCommitment?engineerAvailabilityLabel(a):`${workload(state,a.id)} / ${state.rules.cap} active projects`}
                        </span>
                        <Badge tone={a.eligibleForNewAssignment ? "green" : "amber"}>{a.eligibleForNewAssignment ? "Credential requirements met" : "View credential eligibility"}</Badge>
                        <span className="engineer-profile-action">View Profile <Icon name="arrow" size={15} /></span>
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
          <div className="modal-actions"><Button variant="primary" icon="plus" onClick={() => { setCompanyCreatedNotice(undefined); setDialog({kind:"add-company"}) }}>Add company</Button></div>
          {companyCreatedNotice && <div className="company-created-notice" role="status" aria-live="polite" aria-atomic="true">
            <span className="company-created-notice-icon"><Icon name="check" size={22} /></span>
            <div className="company-created-notice-copy"><strong>{companyCreatedNotice.name} was added successfully.</strong><p>{companyCreatedNotice.verified ? "Registered and verified. The company is listed under Registered Companies." : "Saved under Pending Verification. Verification is required before project allocation."}</p>{companyCreatedNotice.refreshRequired && <p>The company was saved. Refresh the directory to see the latest record.</p>}</div>
            <div className="company-created-notice-actions">
              {state.companies.some(company => company.id === companyCreatedNotice.id) && <Button onClick={() => setDialog({ kind: "company", id: companyCreatedNotice.id })}>View Company</Button>}
              {companyCreatedNotice.refreshRequired && <Button onClick={async () => { try { await reloadWorkspace(); setCompanyCreatedNotice(current => current && { ...current, refreshRequired: false }) } catch { /* Keep the saved-company notice and refresh option visible. */ } }}>Refresh Directory</Button>}
              <Button variant="icon-button" icon="close" aria-label="Dismiss company creation notification" onClick={() => setCompanyCreatedNotice(undefined)} />
            </div>
          </div>}
          {state.phaseAllocationAvailable && <AllocationDirectory onChanged={reloadWorkspace} />}
          <div className="active-sites-view-tabs" role="tablist" aria-label="Subcontractor directory views">
            {[
              ["registered", "Registered companies"],
              ["pending", `Pending verification (${pending.length})`],
              ["rejected", "Rejected"],
              ["archived", "Archived"],
            ].map(([v, l]) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={subconTab === v}
                tabIndex={subconTab === v ? 0 : -1}
                onKeyDown={event => {
                  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
                  event.preventDefault()
                  const tabs = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') || [])
                  const index = tabs.indexOf(event.currentTarget)
                  const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length
                  tabs[next]?.focus()
                  tabs[next]?.click()
                }}
                onClick={() => { setSearchLanding(undefined); setSubconTab(v) }}
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
                      <div className={`company-card-shell ${searchLanding?.recordId === c.id ? "search-result-highlight" : ""}`} key={c.id}>
                      <button
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
                            <Icon name="building" size={16} />
                            {c.commitmentCount ?? projects.length}/2 project commitments
                          </span>
                        </div>
                        <div className="coverage">
                          <span>
                            Verified capabilities
                            <strong>{c.capabilityReview?.disciplines.length || 0}</strong>
                          </span>
                        </div>
                        <div className="capability-card-tags">{(c.capabilityReview?.disciplines || []).map(trade=><span key={trade}>{trade}</span>)}{!c.capabilityReview?.disciplines.length && <Badge tone="amber">Capability Review Required</Badge>}</div>
                        {c.foremen?.map((foreman,index)=><p key={index}>{foreman.name} · {foreman.phone}</p>)}
                        <div className="card-bottom">
                          <span>View company details</span>
                          <Icon name="arrow" size={17} />
                        </div>
                      </button>
                      <CompanyRemovalActions company={c} onView={() => setDialog({kind:"company",id:c.id})} onRemoved={async () => { await reloadWorkspace(); setDialog(undefined); setToast("Company removed from the active directory") }} />
                      </div>
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
      <div className="active-sites-view-tabs" role="tablist" aria-label={label}>
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
            undefined,
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
            "Team & Accounts",
            <div className="share-login-header-actions">
            <Button onClick={() => setShareLoginLinksOpen(true)}>Share login links</Button>
            <Button
              variant="primary"
              icon="plus"
              onClick={() => setDialog({ kind: "add-account" })}
            >
              Add account
            </Button>
            </div>,
          )}
          <Panel
            title="Organization accounts"
            subtitle={`${state.accounts.filter((a) => a.status !== "deactivated").length} accounts · Admin-provisioned access`}
            className="team-accounts-panel"
          >
            {teamAlerts.size > 0 && (
              <div className="notice team-license-notice">
                <Icon name="alert" />
                <p><strong>{teamLicenseItems.length} license {teamLicenseItems.length === 1 ? "alert" : "alerts"} across {teamAlerts.size} {teamAlerts.size === 1 ? "account" : "accounts"}.</strong></p>
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
                    <th scope="col">Person</th>
                    <th scope="col">Role</th>
                    <th scope="col">Scope / Specialization</th>
                    <th scope="col">Status</th>
                    <th scope="col">Added</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {teamList.view.items.map((a) => (
                      <tr key={a.id} className={`${teamAlerts.has(a.id) ? "team-needs-attention" : ""} ${searchLanding?.recordId === a.id ? "search-result-highlight" : ""}`}>
                        <td data-label="Person">
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
                              {teamAlerts.has(a.id) && <span className="team-license-alert"><Badge tone="amber">Needs attention · {licenseState(a, state.rules.grace)}</Badge><small>License expiry: {dateLabel(a.expiry)}</small></span>}
                            </span>
                          </button>
                        </td>
                        <td data-label="Role">{ROLE_NAMES[a.role]}</td>
                        <td data-label="Scope / Specialization">
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
                        <td data-label="Status">
                          {a.status === "invited" && a.role === "client" ? <span className="team-status-help"><Badge tone="amber">Pending Setup</Badge><InfoPopover title="Pending client setup" label={`Why is ${a.name} pending setup?`}>This client account has been created. “Invited” is an account status, not an email invitation. Client sign-in also requires approval of a linked project.</InfoPopover></span> : <Status status={a.status} />}
                        </td>
                        <td data-label="Added">{dateLabel(a.added)}</td>
                        <td data-label="Actions">
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
      const archiveList = runList(`admin:archive-${tab}`, focusSearchItems(archived, `admin:archive-${tab}`), {
        searchText: projectSearch,
        filters: [typeFilter(archived), ...dateFilters<Project>(closedDate, "Closed")],
      })
      const accountArchive = (key: string, items: Account[]) =>
        runList(key, focusSearchItems(items, key), {
          searchText: (a) => `${a.name} ${a.email} ${ROLE_NAMES[a.role]}`,
          filters: [roleFilter_],
        })
      const suspendedList = accountArchive("admin:archive-flagged", suspended)
      const deactivatedList = accountArchive("admin:archive-deactivated", deactivated)
      return (
        <div className="admin-archive">
          {pageHeading(
            "Archive",
          )}
          <div className="notice">
            <Icon name="archive" />
            <p>
              Browse retained project records and offboarded accounts.
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
                  onClick={() => { setSearchLanding(undefined); setTab(v) }}
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
                  toolbar={suspended.length > 0}
                  placeholder="Search flagged accounts"
                  noun="account"
                  empty={<p className="compact-empty">No accounts flagged for review.</p>}
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
                  toolbar={deactivated.length > 0}
                  placeholder="Search deactivated accounts"
                  noun="account"
                  empty={<p className="compact-empty">No deactivated accounts.</p>}
                  render={(items) => (
                <>
                {items.map((a) => (
                  <div className={`archive-account ${searchLanding?.recordId === a.id ? "search-result-highlight" : ""}`} key={a.id}>
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
              </div>
            ) : (
              <ListSection
                list={archiveList}
                placeholder="Search archived projects"
                noun="record"
                render={(items) => <ArchiveProjectCards highlightedId={searchLanding?.recordId} projects={items} closedDate={closedDate} onOpen={p => setDialog({ kind: "project", id: p.id })} />}
                empty={<p className="compact-empty">No records in this archive category.</p>}
              />
            )}
          </Panel>
        </div>
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
          <Backups />
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
  function projectAssignments(p: Project) {
    return (
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
                return li && li.daysToExpiry !== null && li.daysToExpiry <= 33 && asg ? <PhaseLicenseFlag item={li} assignment={asg} onOverride={setOverrideTarget} /> : null
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
                      return li && li.daysToExpiry !== null && li.daysToExpiry <= 33 && asg ? <PhaseLicenseFlag item={li} assignment={asg} onOverride={setOverrideTarget} /> : null
                    })()}
                  </div>
                ))}
              </div>
            </section>
    )
  }
  function projectDetails(p: Project, docsOnly = false) {
    const projectHistory = p.history.slice().reverse()
    const historyPageCount = Math.max(1, Math.ceil(projectHistory.length / 3))
    const recentHistory = projectHistory.slice((projectHistoryPage - 1) * 3, projectHistoryPage * 3)
    const staff = [...new Set([p.opmId, ...p.team.map((t) => t.accountId)])]
      .map((id) => state.accounts.find((a) => a.id === id))
      .filter(Boolean) as Account[]
    return (
      <>
        {docsOnly && <>
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
        </>}
        {!docsOnly && <ProjectMonitoringOverview project={p} state={state} onPreview={previewDoc} />}
        {!docsOnly && <><Button icon="doc" onClick={()=>setReportProjectId(p.id)}>Monthly report</Button><IntakeGuidance state={state} project={p} actor={actor} details /></>}
        {!docsOnly && (
          <>
            <ProjectScheduleDetails project={p} today={scheduleToday} />
            {state.multiEngineerAllocationAvailable&&<EngineerResponsibilities project={p} actor={actor} onReload={reloadWorkspace}/>}
            {p.subcontractorAllocation && <section className="detail-section"><TradeAllocationOverview state={state} project={p} /></section>}
            <PlannedTimeline project={p} />
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
            {projectAssignments(p)}
            <EngineerHistory projectId={p.id} />
            <section className="detail-section">
              <h3>Site photo gallery</h3>
              <SitePhotoGallery photos={p.workflow?.photos || []}
                onApprove={p.status !== "completed" ? async photoId => {
                  const result = await sendWorkflow({ type: "release_photo", projectId: p.id, photoId })
                  if (!result.ok) throw new Error(result.error || "Photo release failed. Try again.")
                } : undefined}
                onReject={p.status !== "completed" ? async (photoId, note) => {
                  const result = await sendWorkflow({ type: "reject_photo", projectId: p.id, photoId, note })
                  if (!result.ok) throw new Error(result.error || "Photo rejection failed. Try again.")
                } : undefined} />
            </section>
            <section className="detail-section">
              <h3>Project progress & review history</h3>
              {recentHistory.length ? recentHistory.map((h, i) => (
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
              )) : <p className="role-muted">No project progress or review history yet.</p>}
              {projectHistory.length > 3 && <div className="history-pagination" aria-label="Project history pagination">
                <Button disabled={projectHistoryPage <= 1} onClick={() => setProjectHistoryPage(page => Math.max(1, page - 1))}>Previous</Button>
                <span>Page {projectHistoryPage} of {historyPageCount}</span>
                <Button disabled={projectHistoryPage >= historyPageCount} onClick={() => setProjectHistoryPage(page => Math.min(historyPageCount, page + 1))}>Next</Button>
              </div>}
            </section>
            {p.status === "active" && (
              <section className="detail-section">
                <ProjectScopeSummary scope={p.phaseScope} />
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
          {!docsOnly && p.status === "active" ? <button type="button" className="admin-project-document-folder" aria-haspopup="dialog" onClick={() => setDocumentFolderProjectId(p.id)}>
            <Icon name="folder" size={30} />
            <span><strong>Project Documents</strong><small>{p.docs.filter(doc => doc.uploaded).length} of {p.docs.length} documents on file · View registered files and agreements</small></span>
            <span className="folder-open-label">Open Folder<Icon name="chevron" size={16} /></span>
          </button> : <>
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
          </>}
        </section>
        <section className="detail-section">
          {!docsOnly && p.status === "active" ? <button type="button" className="admin-project-document-folder" aria-haspopup="dialog" onClick={() => setAppointmentFolderProjectId(p.id)}>
            <Icon name="folder" size={30} />
            <span><strong>Site PM Appointment Agreements</strong><small>{appointmentStaff(p, state.accounts).filter(account => appointmentFor(p, account)).length} of {appointmentStaff(p, state.accounts).length} agreements on file · Project-specific Site PM appointments</small></span>
            <span className="folder-open-label">Open Folder<Icon name="chevron" size={16} /></span>
          </button> : <>
          <h3>Site PM appointment agreements</h3>
          <p className="section-description">
            Project-specific appointments for assigned Site PMs.
          </p>
          {staff
            .filter((a) => a.role === "spm")
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
          </>}
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
              {a.role !== "admin" && <div>
                <small>WORKLOAD</small>
                <strong>
                  {a.singleProjectCommitment?engineerAvailabilityLabel(a):`${workload(state,a.id)} / ${state.rules.cap} active projects`}
                </strong>
              </div>}
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
              {a.id===actor.id&&actor.role==='admin'&&<><Button icon="shield" onClick={()=>{setDialog(undefined);setSecurityTab('password');setSecurityOpen(true)}}>Change password</Button><Button onClick={()=>{setDialog(undefined);setSecurityTab('codes');setSecurityOpen(true)}}>Recovery codes</Button></>}
              <Button
                disabled={a.status === "deactivated"}
                icon="edit"
                onClick={() => { setPage("Team"); setDialog({ kind: "edit-account", id: a.id }) }}
              >
                {page === "Team" ? "Edit account" : "Edit in Team & accounts"}
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
            {["opm","spm"].includes(a.role) && <>
              {page !== "Team" && <div className="notice">
                <p>Credentials and specializations are managed in Team & accounts. This view is read-only.</p>
                <Button onClick={() => { setPage("Team"); setDialog({ kind: "account", id: a.id }) }}>Manage in Team & accounts</Button>
              </div>}
              <EngineerCredentials key={a.id} userId={a.id} admin readOnly={page !== "Team"} onChanged={()=>{void reloadWorkspace()}} />
            </>}
            <WorkRecord userId={a.id} />
            <section className={`detail-section account-documents${a.docs.length ? "" : " is-empty"}`}>
              <h3>Engineer documents</h3>
              {a.docs.length ? <DocumentList docs={a.docs} onPreview={previewDoc} /> : <p className="compact-empty">No documents on file.</p>}
              <div className="document-upload">
                <div>
                  <strong>Employment contract</strong>
                </div>
                {a.docs.some((d) => d.label === "Employment Contract") ? (
                  <Badge tone="green">On file</Badge>
                ) : (
                  <Upload
                    disabled={a.status === "deactivated"}
                    label="Employment Contract"
                    storageKind="credential"
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
              <p className="compact-empty">No assignments yet.</p>
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
      <div className="company-detail-compact">
        <div className="detail-hero">
          <span className="company-monogram large">{initials(c.name)}</span>
          <div>
            <span className="eyebrow">PROJECT-LEVEL SUBCONTRACTOR</span>
            <h3>{c.name}</h3>
            <p>{c.email}</p>
          </div>
          <Badge tone={c.status === "pending" ? "amber" : c.status === "approved" ? "green" : "gray"}>{c.status === "pending" ? "Pending Admin verification" : c.status}</Badge>
        </div>
        <div className="detail-grid account-detail-grid">
          {!c.foremen?.length && <><div>
            <small>CONTACT PERSON</small>
            <strong>{c.contact}</strong>
          </div>
          <div>
            <small>PHONE</small>
            <strong>{c.phone}</strong>
          </div></>}
          <div>
            <small>AVAILABILITY</small>
            <strong>{c.availability.replace("_", " ")}</strong>
          </div>
        </div>
        <CompanyForemen company={c} />
        {state.phaseAllocationAvailable && <CompanyProjectPhases companyId={c.id} />}
        {c.note?.trim() && <p className="section-description">{c.note}</p>}
        <CompanyCapabilities key={c.id + (c.capabilityReview?.reviewedAt || "")} company={c} role={actor.role} onPreview={previewDoc}
          onUpload={async doc => { await api("/subcontractors/" + c.id + "/supporting-documents", {method:"POST",json:{doc}}); await reloadWorkspace() }}
          onSave={async review => { await api("/subcontractors/" + c.id + "/capabilities", {method:"PUT",json:review}); await reloadWorkspace() }} />
        <section className="detail-section">
          <h3>Active project commitments</h3>
          <div className="tag-list subsection">
            {c.activeProjectIds.map((projectId) => (
              <span key={projectId}>{projectFor(projectId)}</span>
            ))}
          </div>
          {!c.activeProjectIds.length && (
            <p className="compact-empty">No active project commitments.</p>
          )}
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
        <div className="modal-actions company-detail-actions">
          <CompanyRemovalActions company={c} labeled onRemoved={async () => { await reloadWorkspace(); setDialog(undefined); setToast("Company removed from the active directory") }} />
          <Button onClick={() => setDialog(undefined)}>Close</Button>
          {c.status === "pending" && (
            <>
              <Button
                variant="danger-ghost"
                onClick={() => approval(c, "rejected")}
              >
                Reject request
              </Button>
<p>Complete Admin capability verification above to approve this company for allocation.</p>
            </>
          )}
        </div>
      </div>
    )
  }
  const pendingRole = loadingWorkspaceRole ?? (tokenUser()?.role === "client" ? "client" : undefined)
  const loadingRole = pendingRole && roleAllowedOnHost(pendingRole, window.location.hostname) ? pendingRole : undefined
  if (signingOut) return <WorkspaceSkeleton role={loadingRole} />
  if (signedOut && checkingSession) return <WorkspaceSkeleton role={loadingRole} />
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
              <Button onClick={signOut.request}>Sign out</Button>
            </div>
            {signOut.dialog}
          </div>
        )}
      </main>
    )
  if (signedOut || !actor.id)
    return <LoginPage key={loginPortal} portal={loginPortal} onSignIn={signIn} workspaceRole={loadingWorkspaceRole} sessionMessage={sessionMessage} />
  if(mustResetPassword)return <PasswordReset onComplete={()=>setMustResetPassword(false)} onCancel={endSession} />
  if (actor.role === "client") {
    const views = clientProjectViews(state, actor.id)
    return (
      <>
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
        onStayActive={stayActive}
      />
      {signOut.dialog}
      </>
    )
  }
  if ((actor.role === "opm" || actor.role === "spm") && state.license?.self && requiresRenewalOnlyAccess(state.license.self))
    return <><RestrictedRenewalPage actor={actor} status={state.license.self} onReload={reloadWorkspace} onSignOut={signOut.request} />{signOut.dialog}</>
  if (actor.role === "opm" || actor.role === "spm")
    return (
      <>
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
        onStayActive={stayActive}
        onResume={endSession}
        onPause={endSession}
      />
      {signOut.dialog}
      </>
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
          <span className="brand-mark"><img src="/images/10-builders-logo.png" alt="10 Builders" width="30" height="48" /></span>
          <div>
            10BuildLine<small>10 BUILDERS</small>
          </div>
          <Button className="sidebar-close admin-nav-close" variant="icon-button" icon="close" aria-label="Close navigation" onClick={navigation.close} />
        </div>
        <CollapsibleSidebarNav items={NAV} page={page} counts={navigationCounts} onNavigate={navigate} />

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
                signOut.request()
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
      <div className="main-shell" ref={swipe.ref}>
        <header className="topbar">
          <div className="breadcrumb">
            <Button
              ref={navigation.toggleRef}
              className="sidebar-toggle"
              hidden={navigation.expanded}
              variant="icon-button"
              icon="menu"
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
          <AdminRecoveryNotice onManage={()=>{setSecurityTab('codes');setSecurityOpen(true)}}/>
          {searchLanding && <div className="search-landing-notice" role="status">
            <Icon name="search" size={20} />
            <div><strong>Opened from search: {searchLanding.document?.name || searchLanding.name}</strong><p>{searchLanding.page}{searchLanding.directoryTab === "subcontractors" ? " · Subcontractors" : searchLanding.directoryTab === "engineers" ? " · Engineers" : ""} · {searchLanding.document ? searchLanding.name : "Showing the selected record"}</p></div>
            <Button onClick={() => { if (searchLanding.document) previewDoc(searchLanding.document); else setDialog({ kind: searchLanding.dialog, id: searchLanding.recordId }) }}>View {searchLanding.document ? "document" : "details"}</Button>
            <Button onClick={() => { setSearchLanding(undefined); setProjectRepositoryPath({}) }}>Show all records</Button>
          </div>}
          {renderPage()}
        </main>
      </div>
      {securityOpen&&<AdminAccountSecurity initialTab={securityTab} onClose={()=>setSecurityOpen(false)} onPasswordChanged={endSession}/>}
      {shareLoginLinksOpen && <ShareLoginLinks onClose={() => setShareLoginLinksOpen(false)} />}
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
      {dialog?.kind === "intake-record" && selectedProject && <Modal title="Project Intake Record" subtitle={selectedProject.name} wide onClose={() => setDialog(undefined)}>
        <IntakeRecord state={state} project={selectedProject} actor={actor} onOpenActive={() => { navigate("Active sites"); setDialog({ kind: "project", id: selectedProject.id }) }} />
        {!isIntakeHistory(selectedProject) && <>
          {projectAssignments(selectedProject)}
          {state.multiEngineerAllocationAvailable && <EngineerResponsibilities project={selectedProject} actor={actor} onReload={reloadWorkspace} />}
        </>}
      </Modal>}
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
            setToast("Office signing confirmed. The replacement is now assigned.")
          }}
        />
      )}
      {renewalsOpen && (
        <Modal title="Credential verification & renewals" subtitle="Review initial credentials awaiting approval and license renewal submissions." onClose={() => setRenewalsOpen(false)} wide>
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
          <EngineerCredentials key={selectedAccount.id} userId={selectedAccount.id} admin onChanged={()=>{void reloadWorkspace()}} />
        </Modal>
      )}
      {dialog?.kind === "add-company" && <Modal title="Add subcontractor company" subtitle="Company details, trades and Admin verification in one form." wide onClose={() => setDialog(undefined)}>
        <CompanyForm role="admin" owner={actor.name} actorId={actor.id} status="pending" onClose={() => setDialog(undefined)} onSave={async company => {
          const saved = await createCompany(company)
          const verified = saved.status === "approved"
          setCompanyCreatedNotice({ id: saved.id || company.id, name: company.name.trim(), verified })
          setDialog(undefined)
          setSubconTab(verified ? "registered" : "pending")
          try { await reloadWorkspace() }
          catch { setCompanyCreatedNotice(current => current && { ...current, refreshRequired: true }) }
        }} />
      </Modal>}
      {dialog?.kind === "company" && selectedCompany && (
        <Modal
          title="Subcontractor company"
          wide
          onClose={() => setDialog(undefined)}
        >
          {companyDetails(selectedCompany)}
        </Modal>
      )}
      {actor.role === "admin" && dialog?.kind === "search" && (
        <AdminWorkspaceSearch role={actor.role} state={state} projectStatuses={STATUS}
          onClose={() => setDialog(undefined)}
          onOpen={(kind, id) => setDialog({ kind, id })}
          onPreview={previewDoc} onSelect={openSearchResult} />
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
      {monthlySummaryOpen && <MonthlySummaryDialog onClose={() => setMonthlySummaryOpen(false)} />}
      {reportProjectId && <MonthlyReport projects={state.projects} initialProjectId={reportProjectId} onClose={()=>setReportProjectId("")} />}
      {actor.role === "admin" && dialog?.kind === "project" && selectedProject?.id === documentFolderProjectId && <AdminProjectDocuments key={selectedProject.id} project={selectedProject} onPreview={previewDoc} onClose={() => setDocumentFolderProjectId("")} onDownloadsRequested={() => setToast("Document downloads requested. Your browser may ask to allow multiple downloads.")} />}
      {actor.role === "admin" && dialog?.kind === "project" && selectedProject?.id === appointmentFolderProjectId && <SitePmAppointmentAgreements key={selectedProject.id} project={selectedProject} accounts={state.accounts} onPreview={previewDoc} onUpload={(account, doc) => addEngagement(selectedProject, account, doc)} onClose={() => setAppointmentFolderProjectId("")} />}
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
      {credentials && <AccountSignInDetails details={credentials} onClose={() => setCredentials(undefined)} />}
      {signOut.dialog}
      {idleWarning && !signedOut && (
        <div className="session-warning">
          <Icon name="clock" />
          <span>Your session will pause after inactivity.</span>
          <Button onClick={stayActive}>Stay signed in</Button>
        </div>
      )}
      {selectedNotification && <NotificationDetail notification={selectedNotification} saveState={notificationSettings}
        action={notificationAction(selectedNotification, actor, state.projects, state.accounts, [...NAV.map(item => item.label), "Reports", "Approvals", "Project documents", "Engineer documents", "Engineer directory", "Subcon directory"])}
        onClose={() => setSelectedNotification(undefined)} onOpen={action => {
          setSelectedNotification(undefined)
          if (/password reset requested/i.test(selectedNotification.title)) { navigate("Dashboard"); setResetRequestFocus(value=>value+1) }
          else if (action.kind === "project") setDialog({ kind: "project", id: action.id })
          else if (action.kind === "account") setDialog({ kind: "account", id: action.id })
          else if (action.kind === "page") {
            setDialog(undefined)
            if (action.page === "Approvals") openPendingRequests()
            else navigate(action.page)
          }
        }} />}

    </div>
  )
}

export default function App() {
  return <><AppInner /><ActionFeedback /></>
}

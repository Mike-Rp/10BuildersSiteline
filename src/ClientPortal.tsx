import { LoadingRoleProvider } from "./LoadingSkeleton"
import ExtensionWorkflow from "./ExtensionWorkflow"
import useSidebarNavigation from "./useSidebarNavigation"
import useSignOutConfirmation from "./useSignOutConfirmation"
import UrgentActionBanner from "./UrgentActionBanner"
import { clientExecutiveSummary } from "./client-executive-summary"
import { ProjectScheduleDetails, useScheduleToday } from "./ScheduleStatus"
import ClientOverview from "./ClientOverview"
import PageTitlePanel from "./PageTitlePanel"
import ClientSamplePhotos from "./ClientSamplePhotos"
import { canShowClientPhotoExamples } from "./client-photo-examples"
import NotificationDetail from "./NotificationDetail"
import NotificationMessages from "./NotificationMessages"
import { notificationAction } from "./notification-action"
import type { Event as WorkspaceEvent } from "./model"
import { NotificationSaveStatus, type NotificationSaveState } from "./useNotificationSettings"
import MonthlyReport from "./MonthlyReport"
import { normalizeWorkspacePage } from "./adminNav"
import ActiveSites from "./ActiveSites"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { Badge, Button, Empty, Field, Icon, Modal } from "./ui"
import { downloadDoc, fileFor, Preview } from "./panels"
import { dateLabel, initials, type Account, type Doc } from "./model"
import {
  clientDocumentIndex,
  type ClientDocument,
  type ClientProjectView,
} from "./client-access"
import DocumentRepository from "./DocumentRepository"
import { ListSection, runList, useListMemory } from "./ListControls"
import { inDateRange, optionsFrom } from "./listing"

type Viewer = {
  projectId: string
  documentId: string
  kind: "document" | "photo"
}
const NAV = [
  ["Active sites", "grid"],
  ["Project Overview", "building"],
  ["Project Documents", "folder"],
  ["Progress History", "clock"],
  ["Site Photographs", "doc"],
  ["Preferences", "settings"],
]
function Panel({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <section className="panel">
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
export default function ClientPortal({
  actor,
  projects,
  readNoticeIds,
  mutedTypes,
  onMute,
  onResolve,
  onReport,
  onRecord,
  onRead,
  notificationSave,
  paused,
  onResume,
  onPause,
  idleWarning,
  onStayActive,
}: {
  actor: Pick<Account, "id" | "name" | "email" | "status">
  projects: ClientProjectView[]
  readNoticeIds: string[]
  mutedTypes: string[]
  onMute: (type: string) => void
  onResolve: (
    projectId: string,
    documentId: string,
    kind: Viewer["kind"],
  ) => Doc
  onReport: (projectId: string) => string
  onRecord: (projectId: string, title: string, detail: string) => void
  onRead: (ids: string[]) => void
  notificationSave?: NotificationSaveState
  paused: boolean
  onResume: () => void
  onPause: () => void
  idleWarning: boolean
  onStayActive: () => void
}) {
  const [page, setPage] = useState("Project Overview")
  const [siteDetails, setSiteDetails] = useState(false)
  const [projectId, setProjectId] = useState(projects[0]?.id || "")
  const navigation = useSidebarNavigation(!paused)
  const signOut = useSignOutConfirmation(onPause)
  const [bell, setBell] = useState(false)
  const [selectedNotification, setSelectedNotification] = useState<WorkspaceEvent>()
  const [viewer, setViewer] = useState<Viewer>()
  const [reportProjectId,setReportProjectId]=useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [documentQuery, setDocumentQuery] = useState("")
  useListMemory()
  const project = projects.find((p) => p.id === projectId) || projects[0]
  const scheduleToday = useScheduleToday()
  const scheduleAttention = project ? clientExecutiveSummary(project, scheduleToday).schedule : undefined
  const history = project?.history.slice().reverse().sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0)) || []
  const notices = projects
    .flatMap((p) =>
      p.history.map((item) => ({
        id: item.id,
        projectId: p.id,
        projectName: p.name,
        date: item.date,
        phase: item.phase,
        progress: item.progress,
        text: item.text,
        type: /approved|completed|sign.off/i.test(item.text)
          ? "approval"
          : "progress",
      })),
    )
    .filter((item) => !mutedTypes.includes(item.type))
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
  const unread = notices.filter(
    (item) => !readNoticeIds.includes(item.id),
  ).length
  const viewerProject = projects.find((p) => p.id === viewer?.projectId)
  const permittedViewer =
    viewer &&
    viewerProject &&
    (viewer.kind === "document"
      ? viewerProject.documents
      : viewerProject.photos
    ).some((doc) => doc.id === viewer.documentId && doc.uploaded)
  let viewedDoc: Doc | undefined
  if (permittedViewer && viewer) {
    try {
      viewedDoc = onResolve(viewer.projectId, viewer.documentId, viewer.kind)
    } catch {
      /* Revoked access removes the preview immediately. */
    }
  }
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(""), 5000)
    return () => clearTimeout(timer)
  }, [message])
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest(".notification-container"))
        setBell(false)
    }
    window.addEventListener("pointerdown", outside)
    return () => window.removeEventListener("pointerdown", outside)
  }, [])
  function navigate(next: string) {
    setSiteDetails(false)
    const target = normalizeWorkspacePage(next)
    setPage(NAV.some(([label]) => label === target) ? target : "Project Overview")
    navigation.closeMobile()
    setBell(false)
    setError("")
  }
  function openDocument(
    documentId: string,
    kind: Viewer["kind"] = "document",
    targetProjectId = project?.id,
  ) {
    if (!targetProjectId) return
    try {
      const doc = onResolve(targetProjectId, documentId, kind)
      setViewer({ projectId: targetProjectId, documentId, kind })
      onRecord(
        targetProjectId,
        kind === "photo"
          ? "Client viewed shared site photograph"
          : "Client viewed authorized document",
        doc.label,
      )
      setError("")
    } catch (reason) {
      setError((reason as Error).message)
    }
  }
  async function downloadDocument(projectId: string, id: string) {
    try {
      const doc = onResolve(projectId, id, "document")
      await downloadDoc(doc)
      onRecord(projectId, "Client document download requested", doc.label)
      setMessage(
        "Download requested. Seeded records export metadata; uploaded records download their original file.",
      )
    } catch (reason) {
      setError((reason as Error).message)
    }
  }
  function report() {
    if (!project) return
    setReportProjectId(project.id)
  }
  function documents(compact = false) {
    if (!project) return null
    const rows = compact
      ? project.documents
      : project.documents.filter((doc) =>
          `${doc.label} ${doc.name}`
            .toLowerCase()
            .includes(documentQuery.toLowerCase()),
        )
    return (
      <div className="client-document-list">
        {!compact && (
          <div className="client-document-search">
            <Icon name="search" size={18} />
            <input
              aria-label="Search authorized documents"
              placeholder="Search authorized project documents"
              value={documentQuery}
              onChange={(event) => setDocumentQuery(event.target.value)}
            />
          </div>
        )}
        {rows.map((doc, index) => (
          <div className="client-document-card" key={doc.id}>
            <span className="client-doc-number">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="file-icon">
              <Icon name="doc" />
            </span>
            <div>
              <h3>{doc.label}</h3>
              <p>
                {doc.uploaded
                  ? `${doc.name} · ${
                      doc.date ? dateLabel(doc.date) : "On file"
                    }`
                  : "Not available yet"}
              </p>
            </div>
            <Badge tone={doc.uploaded ? "green" : ""}>
              {doc.uploaded ? "Available" : "Pending"}
            </Badge>
            {doc.uploaded && (
              <div className="button-group">
                <Button icon="eye" onClick={() => openDocument(doc.id)}>
                  View
                </Button>
                <Button
                  variant="icon-button"
                  icon="download"
                  aria-label={`Download ${doc.label}`}
                  onClick={() => downloadDocument(project.id, doc.id)}
                />
              </div>
            )}
          </div>
        ))}
        {!rows.length && (
          <Empty title="No authorized documents match">
            Documents will appear when the project team makes eligible records
            available.
          </Empty>
        )}
        <div className="client-document-note">
          <Icon name="shield" size={17} />
          <p>
            This repository contains only documents authorized for your assigned
            project. Staff-only contracts, financial records and internal
            operational files are not included.
          </p>
        </div>
      </div>
    )
  }
  function historyList(compact = false) {
    const emptyHistory = (
      <Empty title="No shared progress updates yet">
        Updates will appear when they are shared with your account.
      </Empty>
    )
    const row = (item: (typeof history)[number]) => (
      <article key={item.id}>
        <span className="client-history-mark">
          <Icon name="clock" size={16} />
        </span>
        <div>
          <span className="client-history-date">
            {dateLabel(item.date)} · {item.phase}
          </span>
          <p>{item.text}</p>
          <Badge>Recorded update</Badge>
        </div>
        <strong>{item.progress}%</strong>
      </article>
    )
    if (compact)
      return (
        <div className="client-history-list">
          {history.slice(0, 3).map(row)}
          {!history.length && emptyHistory}
        </div>
      )
    // The client's own project history only: scoping already happened.
    const historyView = runList(`client:history:${project?.id}`, history, {
      searchText: (item) => `${item.text} ${item.phase}`,
      filters: [
        {
          id: "phase",
          label: "Phase",
          allLabel: "All phases",
          options: optionsFrom(history.map((item) => item.phase)),
          test: (item, value) => item.phase === value,
        },
        {
          id: "from",
          label: "From",
          kind: "date",
          test: (item, value) => inDateRange(item.date, value),
        },
        {
          id: "to",
          label: "To",
          kind: "date",
          test: (item, value) => inDateRange(item.date, undefined, value),
        },
      ],
    })
    return (
      <div className="client-history-list">
        <ListSection
          list={historyView}
          placeholder="Search progress history"
          noun="update"
          touch
          render={(items) => <>{items.map(row)}</>}
          empty={emptyHistory}
        />
      </div>
    )
  }
  function checklist() {
    if (!project) return null
    return (
      <div className="client-checklist">
        {project.checklist.map((item) => (
          <div key={item.label}>
            <Icon
              name={item.status === "approved" ? "check" : "clock"}
              size={16}
            />
            <span>{item.label}</span>
            <Badge
              tone={
                item.status === "approved"
                  ? "green"
                  : item.status === "under_review"
                    ? "amber"
                    : ""
              }
            >
              {item.status === "approved"
                ? "Approved"
                : item.status === "under_review"
                  ? "Under Office PM review"
                  : "Not yet submitted"}
            </Badge>
          </div>
        ))}
        {!project.checklist.length && (
          <Empty title="Historical checklist not imported">
            The completion record is read-only. Individual historic evidence was
            not included in the source data.
          </Empty>
        )}
      </div>
    )
  }
  function photos(compact = false) {
    if (!project) return null
    if (canShowClientPhotoExamples(actor, project)) return <ClientSamplePhotos key={project.id} compact={compact} projectName={project.name} />
    if (!project.photos.length)
      return (
        compact ? <p className="co-empty">No site photos shared yet.</p> :
        <div className="client-photo-empty">
          <span>
            <Icon name="building" size={34} />
          </span>
          <div>
            <h3>Site photographs will appear here</h3>
            <p>
              Only photographs explicitly shared by your project team are shown.
              Internal inspection evidence is not part of this gallery.
            </p>
          </div>
        </div>
      )
    const grid = (items: typeof project.photos, collage = false) => (
      <div className={`client-photos-grid ${collage ? `client-photos-collage photos-${items.length}` : ""}`}>
        {items.map((photo) => (
          <ClientPhoto
            key={photo.id}
            projectId={project.id}
            photo={photo}
            onResolve={onResolve}
            onOpen={() => openDocument(photo.id, "photo")}
          />
        ))}
      </div>
    )
    if (compact) return grid(project.photos.slice().sort((a,b) => b.date.localeCompare(a.date)).slice(0, 3), true)
    const photoView = runList(`client:photos:${project.id}`, project.photos, {
      searchText: (photo) => `${photo.label} ${photo.name}`,
      filters: [
        {
          id: "from",
          label: "Taken from",
          kind: "date",
          test: (photo, value) => inDateRange(photo.date, value),
        },
        {
          id: "to",
          label: "Taken to",
          kind: "date",
          test: (photo, value) => inDateRange(photo.date, undefined, value),
        },
      ],
    })
    return (
      <ListSection
        list={photoView}
        placeholder="Search photographs"
        noun="photograph"
        touch
        render={grid}
      />
    )
  }
  function overview() {
    if (!project) return null
    return <><ExtensionWorkflow actor={{ ...actor, role: "client" }} projectId={project.id} /><ClientOverview project={project} latest={history[0]} photos={photos(true)} onNavigate={navigate} onDetails={() => setSiteDetails(true)} /></>
  }
  function projectDetails() {
    if (!project) return null
    return <>
      <ExtensionWorkflow actor={{ ...actor, role: "client" }} projectId={project.id} />
      <ProjectScheduleDetails project={project} today={scheduleToday} />
      <dl className="client-project-facts">
        <div><dt>Project type</dt><dd>{project.type}</dd></div>
        <div><dt>Location</dt><dd>{project.location || "Not set"}</dd></div>
        <div><dt>Floor area</dt><dd>{project.area} sqm</dd></div>
        <div><dt>Floors</dt><dd>{project.floors}</dd></div>
        <div><dt>Target start</dt><dd>{project.start ? dateLabel(project.start) : "Not set"}</dd></div>
        <div><dt>Target completion</dt><dd>{project.end ? dateLabel(project.end) : "Not set"}</dd></div>
      </dl>
      <Panel title="Project contacts">
        <div className="client-contacts">
          {project.contacts.map(contact => <div key={contact.role}><span className="avatar large">{initials(contact.name)}</span><div><strong>{contact.name}</strong><p>{contact.role}</p></div></div>)}
          {!project.contacts.length && <p>No project contacts recorded.</p>}
        </div>
      </Panel>
      <Panel title={`Activity status · ${project.phase}`}>{checklist()}</Panel>
    </>
  }

  function pageContent() {
    if (page === "Preferences")
      return (
        <>
          <Panel
            title="Your notification preferences"
            subtitle="Personal settings only. No access to staff queues or organization rules."
          >
            <div className="notification-settings">
              {["request", "approval", "progress", "notice"].map((type) => (
                <label className="preference-row" key={type}>
                  <span>
                    <strong>
                      {type[0].toUpperCase() + type.slice(1)} updates
                    </strong>
                    <small>
                      Only authorized Client-visible project updates can appear
                      in your inbox.
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    disabled={actor.status !== "active" || notificationSave?.pending}
                    checked={!mutedTypes.includes(type)}
                    onChange={() => onMute(type)}
                  />
                </label>
              ))}
            </div>
          </Panel>
          <Panel title="Your Client account">
            <div className="account-settings">
              <span className="avatar large">{initials(actor.name)}</span>
              <div>
                <h3>{actor.name}</h3>
                <p>
                  {actor.email} · Client · {actor.status}
                </p>
              </div>
              <Badge>Project access is read only</Badge>
            </div>
            <div className="notice neutral">
              <Icon name="shield" />
              <p>
                Contact your Administrator for account, password or access
                changes.
              </p>
            </div>
          </Panel>
        </>
      )
    if (page === "Active sites") return <>
      <ActiveSites key={actor.id} overallOnly projects={projects.filter(p => p.status === "active").map(p => ({ ...p, lead: p.contacts.find(c => c.role === "Site Project Manager")?.name }))} onOpen={id => { setProjectId(id); setSiteDetails(true) }} />
    </>
    if (!project)
      return (
        <div className="client-access-empty">
          <span className="client-empty-icon">
            <Icon name="shield" size={40} />
          </span>
          <h1>
            {actor.status === "active"
              ? "Your project access is pending"
              : "Account access is unavailable"}
          </h1>
          <p>
            {actor.status === "active"
              ? "No activated project is currently linked to your account. Access becomes available only after internal project setup is complete and your project is authorized."
              : "Your account is not active. Contact your Administrator for review."}
          </p>
          <Badge>Read-only Client Portal</Badge>
          <p className="role-muted">
            No internal project records are exposed while access is unavailable.
          </p>
        </div>
      )
    if (page === "Project Overview") return overview()
    if (page === "Project Documents")
      return (
        <DocumentRepository
          listKey="client:documents"
          recentKey={actor.id}
          projects={projects.map((view) => ({
            id: view.id,
            name: view.name,
            subtitle: `${view.type} · ${view.phase}`,
            type: view.type,
            phase: view.phase,
            status: view.status,
            categories: clientDocumentIndex(view).map((category) => ({
              ...category,
              folders: category.folders.map((folder) => ({
                ...folder,
                files: folder.files.map((doc) => ({
                  id: doc.id,
                  label: doc.label,
                  name: doc.name,
                  date: doc.date,
                  downloadable: folder.kind === "document",
                })),
              })),
            })),
          }))}
          onOpen={(id, fileId) => {
            const view = projects.find((p) => p.id === id)
            const isPhoto = view?.photos.some((doc) => doc.id === fileId)
            openDocument(fileId, isPhoto ? "photo" : "document", id)
          }}
          onDownload={(id, fileId) => downloadDocument(id, fileId)}
        />
      )
    if (page === "Progress History")
      return (
        <Panel title="Recorded project history">
          {historyList()}
        </Panel>
      )
    return (
      <Panel
        title="Shared site photographs"
      >
        {photos()}
      </Panel>
    )
  }
  return (
    <LoadingRoleProvider role="client"><div className={`app-shell client-portal ${navigation.expanded ? "sidebar-expanded" : "sidebar-collapsed"}`}>
      <aside id="client-navigation" ref={navigation.sidebarRef} className="sidebar" aria-label="Client sidebar" aria-hidden={!navigation.expanded} inert={!navigation.expanded}>
        <div className="brand">
          <span className="brand-mark">
            10
          </span>
          <div>
            Siteline<small>10 BUILDERS</small>
          </div>
          <Button className="sidebar-close client-nav-close" variant="icon-button" icon="close" aria-label="Close Client navigation" onClick={navigation.close} />
        </div>
        <div className="nav-group-label">YOUR PROJECT</div>
        <nav aria-label="Client navigation">
          {NAV.map(([label, icon]) => (
            <button
              key={label}
              aria-label={label}
              className={`nav-item ${page === label ? "active" : ""}`}
              onClick={() => navigate(label)}
            >
              <Icon name={icon} size={19} />
              <span>{{"Project Overview":"Overview","Project Documents":"Documents","Progress History":"Progress history","Site Photographs":"Site photos"}[label] || label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-person">
            <span className="avatar">{initials(actor.name)}</span>
            <span>
              <strong>{actor.name}</strong>
              <small>Client</small>
            </span>
            <Button
              variant="icon-button"
              icon="logout"
              aria-label="Sign out"
              onClick={() => { navigation.closeMobile(); signOut.request() }}
            />
          </div>
        </div>
      </aside>
      {navigation.compact && navigation.expanded && (
        <button
          type="button"
          className="mobile-nav-backdrop client-nav-backdrop"
          aria-label="Close Client navigation backdrop"
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
              hidden={navigation.expanded}
              variant="icon-button"
              icon="menu"
              aria-label={navigation.expanded ? navigation.compact ? "Close Client navigation" : "Collapse Client navigation" : navigation.compact ? "Open Client navigation" : "Expand Client navigation"}
              aria-expanded={navigation.expanded}
              aria-controls="client-navigation"
              onClick={navigation.toggle}
            />
            <span>Client Portal</span>
            <Icon name="chevron" size={14} />
            <strong>{page}</strong>
          </div>
          <div className="topbar-actions">
            <div className="notification-container">
              <Button
                icon="bell"
                variant="icon-button"
                aria-label={`Client notifications, ${unread} unread`}
                onClick={() => setBell(!bell)}
              />
              {unread > 0 && <span className="notification-dot" />}
              {bell && (
                <div className="notification-popover">
                  <div className="popover-heading">
                    <h3>Project updates</h3>
                    <Button
                      variant="text-button"
                      onClick={() => onRead(notices.map((item) => item.id))}
                    >
                      Mark all read
                    </Button>
                  </div>
                  <NotificationMessages key={actor.id} items={notices} renderItems={items => <>{items.map((item) => (
                    <button
                      className="activity-item"
                      key={item.id}
                      onClick={() => {
                        onRead([item.id])
                        setBell(false)
                        setSelectedNotification({ id: item.id, projectId: item.projectId, title: item.projectName,
                          detail: item.text, date: item.date, type: item.type, read: true, target: "Progress History" })
                      }}
                    >
                      <span className="activity-icon approval">
                        <Icon name="check" size={17} />
                      </span>
                      <span className="activity-copy">
                        <strong>{item.projectName}</strong>
                        <small>
                          {item.phase} · {item.progress}% recorded progress
                        </small>
                        <span className="activity-time">
                          {dateLabel(item.date)}
                        </span>
                      </span>
                      {!readNoticeIds.includes(item.id) && (
                        <i className="unread-dot" />
                      )}
                    </button>
                  ))}</>} empty={<Empty title="No shared updates yet" />} />
                </div>
              )}
            </div>
            <span className="avatar">{initials(actor.name)}</span>
          </div>
        </header>
        <main className="main-content">
          {notificationSave && <NotificationSaveStatus {...notificationSave} />}
          {project && (
            <div className="client-project-toolbar">
              <Field label="Your project">
                <select
                  value={project.id}
                  onChange={(event) => {
                    setProjectId(event.target.value)
                    setSiteDetails(false)
                    setViewer(undefined)
                    setDocumentQuery("")
                    setError("")
                  }}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Button icon="doc" onClick={report}>
                Monthly report
              </Button>
            </div>
          )}
          {page !== "Project Overview" && (project || page === "Active sites") && (
            <PageTitlePanel title={page} eyebrow={page === "Active sites" ? "YOUR CONSTRUCTION PROJECTS" : project?.name} />
          )}
          {error && (
            <div className="role-error" role="alert">
              <Icon name="alert" />
              <span>{error}</span>
              <Button
                variant="icon-button"
                icon="close"
                aria-label="Dismiss Client error"
                onClick={() => setError("")}
              />
            </div>
          )}
          {project && scheduleAttention?.tone === "amber" && !["Preferences", "Active sites"].includes(page) && <UrgentActionBanner
            label="Project schedule attention" title="Your project schedule needs attention" actionLabel="View project contacts"
            items={[{ key: `client-schedule:${project.id}`, title: project.name, detail: scheduleAttention.detail, status: scheduleAttention.label, urgency: scheduleAttention.label === "Target date passed" ? "overdue" : "soon" }]}
            onOpen={() => setSiteDetails(true)} onReview={() => setSiteDetails(true)} overdueLabel="target date passed" soonLabel="completion date approaching" />}
          {pageContent()}
          {siteDetails && project && <Modal wide title={project.name} subtitle="Project details" onClose={() => setSiteDetails(false)}>{projectDetails()}</Modal>}
          <div className="workspace-footer">
            <span>
              SITELINE <span>Built for the work ahead.</span>
            </span>
          </div>
        </main>
      </div>
      {selectedNotification && <NotificationDetail notification={selectedNotification} saveState={notificationSave}
        action={notificationAction(selectedNotification, { id: actor.id, role: "client" }, projects, [], NAV.map(([label]) => label))}
        onClose={() => setSelectedNotification(undefined)} onOpen={action => {
          setSelectedNotification(undefined)
          if (action.kind === "project") { setProjectId(action.id); navigate("Progress History") }
          else if (action.kind === "page") navigate(action.page)
        }} />}
      {reportProjectId && <MonthlyReport projects={projects} initialProjectId={reportProjectId} allowProjectChange={false} onClose={()=>setReportProjectId("")} />}
      {viewedDoc && viewer && (
        <Preview
          doc={viewedDoc}
          viewer={actor.name}
          downloadable={viewer.kind === "document"}
          onDownload={() =>
            downloadDocument(viewer.projectId, viewer.documentId)
          }
          onClose={() => setViewer(undefined)}
        />
      )}
      {message && (
        <div className="toast" role="status">
          <Icon name="check" size={18} />
          {message}
          <Button
            variant="icon-button"
            icon="close"
            aria-label="Dismiss Client notification"
            onClick={() => setMessage("")}
          />
        </div>
      )}
      {signOut.dialog}
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
              <Icon name="building" size={30} />
            </span>
            <h1>SITELINE</h1>
            <p>Your session has ended.</p>
            <Button variant="primary" onClick={onResume}>
              Sign in again
            </Button>
          </div>
        </div>
      )}
    </div></LoadingRoleProvider>
  )
}
function ClientPhoto({
  projectId,
  photo,
  onOpen,
  onResolve,
}: {
  projectId: string
  photo: ClientDocument
  onOpen: () => void
  onResolve: (projectId: string, id: string, kind: "photo") => Doc
}) {
  const [url, setUrl] = useState("")
  const resolver = useRef(onResolve)
  resolver.current = onResolve
  useEffect(() => {
    let active = true
    let localUrl = ""
    async function load() {
      try {
        resolver.current(projectId, photo.id, "photo")
        const file = await fileFor(photo.id)
        if (active && file) {
          localUrl = URL.createObjectURL(file)
          setUrl(localUrl)
        }
      } catch {
        /* Denied or unavailable images are not fetched or fabricated. */
      }
    }
    load()
    return () => {
      active = false
      if (localUrl) URL.revokeObjectURL(localUrl)
    }
  }, [projectId, photo.id])
  return (
    <button className="client-photo" onClick={onOpen}>
      {url ? (
        <img src={url} alt={photo.name} />
      ) : (
        <span>
          <Icon name="doc" size={30} />
          Shared photograph record
        </span>
      )}
      <div>
        <strong>{photo.name}</strong>
        <small>
          {photo.date ? dateLabel(photo.date) : "Shared by project team"}
        </small>
        <Icon name="eye" size={17} />
      </div>
    </button>
  )
}

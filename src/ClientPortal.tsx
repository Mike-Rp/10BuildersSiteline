import { useEffect, useRef, useState, type ReactNode } from "react"
import { Badge, Button, Empty, Field, Icon } from "./ui"
import { Chart, downloadBlob, downloadDoc, fileFor, Preview } from "./panels"
import { DemoSessionPicker } from "./RoleWorkspace"
import PhaseTimeline from "./PhaseTimeline"
import { dateLabel, initials, today, type Account, type Doc } from "./model"
import type { ClientDocument, ClientProjectView } from "./client-access"

type DemoIdentity = Pick<Account, "id" | "name" | "role" | "status">
type Viewer = {
  projectId: string
  documentId: string
  kind: "document" | "photo"
}
const NAV = [
  ["Project Overview", "building"],
  ["Phase Timeline", "activity"],
  ["Schedule Performance", "trend"],
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
  sessions,
  readNoticeIds,
  mutedTypes,
  onMute,
  onSwitch,
  onResolve,
  onReport,
  onRecord,
  onRead,
  paused,
  onResume,
  onPause,
  idleWarning,
  onStayActive,
  demoMode,
}: {
  actor: Pick<Account, "id" | "name" | "email" | "status">
  projects: ClientProjectView[]
  sessions: DemoIdentity[]
  readNoticeIds: string[]
  mutedTypes: string[]
  onMute: (type: string) => void
  onSwitch: (id: string) => void
  onResolve: (
    projectId: string,
    documentId: string,
    kind: Viewer["kind"],
  ) => Doc
  onReport: (projectId: string) => string
  onRecord: (projectId: string, title: string, detail: string) => void
  onRead: (ids: string[]) => void
  paused: boolean
  onResume: () => void
  onPause: () => void
  idleWarning: boolean
  onStayActive: () => void
  demoMode: boolean
}) {
  const [page, setPage] = useState("Project Overview")
  const [projectId, setProjectId] = useState(projects[0]?.id || "")
  const [mobileNav, setMobileNav] = useState(false)
  const [bell, setBell] = useState(false)
  const [viewer, setViewer] = useState<Viewer>()
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [documentQuery, setDocumentQuery] = useState("")
  const project = projects.find((p) => p.id === projectId) || projects[0]
  const uploaded = project?.documents.filter((doc) => doc.uploaded).length || 0
  const history = project?.history.slice().reverse() || []
  const notices = projects
    .flatMap((p) =>
      p.history.map((item) => ({
        id: item.id,
        projectId: p.id,
        projectName: p.name,
        date: item.date,
        phase: item.phase,
        progress: item.progress,
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
    setPage(next)
    setMobileNav(false)
    setBell(false)
    setError("")
  }
  function openDocument(documentId: string, kind: Viewer["kind"] = "document") {
    if (!project) return
    try {
      const doc = onResolve(project.id, documentId, kind)
      setViewer({ projectId: project.id, documentId, kind })
      onRecord(
        project.id,
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
    try {
      const text = onReport(project.id)
      downloadBlob(
        new Blob([text], { type: "text/plain;charset=utf-8" }),
        `${project.name.replace(/[\\/:*?"<>|]/g, "-")} — progress report.txt`,
      )
      onRecord(
        project.id,
        "Client progress report exported",
        "Approved and baseline Client-visible history only.",
      )
      setMessage("Approved progress report exported as a prototype text file.")
    } catch (reason) {
      setError((reason as Error).message)
    }
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
                <Button icon="search" onClick={() => openDocument(doc.id)}>
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
    return (
      <div className="client-history-list">
        {(compact ? history.slice(0, 3) : history).map((item) => (
          <article key={item.id}>
            <span className="client-history-mark">
              <Icon name="check" size={16} />
            </span>
            <div>
              <span className="client-history-date">
                {dateLabel(item.date)} · {item.phase}
              </span>
              <p>{item.text}</p>
              <Badge tone="green">Approved / recorded</Badge>
            </div>
            <strong>{item.progress}%</strong>
          </article>
        ))}
        {!history.length && (
          <Empty title="No approved progress updates yet">
            Submissions awaiting review are not included in your project
            history.
          </Empty>
        )}
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
    return project.photos.length ? (
      <div className="client-photos-grid">
        {(compact ? project.photos.slice(0, 3) : project.photos).map(
          (photo) => (
            <ClientPhoto
              key={photo.id}
              projectId={project.id}
              photo={photo}
              onResolve={onResolve}
              onOpen={() => openDocument(photo.id, "photo")}
            />
          ),
        )}
      </div>
    ) : (
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
  }
  function overview() {
    if (!project) return null
    return (
      <>
        <section className="client-project-hero">
          <div>
            <div className="client-hero-tags">
              <Badge tone="green">
                {project.status === "completed"
                  ? "Completed project"
                  : "Active construction"}
              </Badge>
              <Badge>Client access · Read only</Badge>
            </div>
            <span className="eyebrow">YOUR PROJECT, IN VIEW</span>
            <h1>{project.name}</h1>
            <p>
              {project.type} <span>·</span>{" "}
              {project.location || "Project location not specified"}
            </p>
            <div className="client-project-specs">
              <span>
                <Icon name="building" size={17} />
                {project.area} sqm · {project.floors} floors
              </span>
              <span>
                <Icon name="calendar" size={17} />
                Target {dateLabel(project.start)} –{" "}
                {project.end ? dateLabel(project.end) : "end not set"}
              </span>
            </div>
          </div>
          <div className="client-progress-block">
            <span>Recorded project completion</span>
            <strong>
              {project.progress}
              <small>%</small>
            </strong>
            <progress value={project.progress} max={100} />
            <p>System tracked · Office PM reviewed</p>
          </div>
        </section>
        <div className="client-overview-metrics">
          <div>
            <span>Current construction phase</span>
            <strong>{project.phase}</strong>
            <small>
              {project.status === "completed"
                ? "All required completion checks passed"
                : "Future phases remain locked until sign-off"}
            </small>
          </div>
          <div>
            <span>Approved / baseline updates</span>
            <strong>{history.length.toString().padStart(2, "0")}</strong>
            <small>
              {history[0]
                ? `Latest record ${dateLabel(history[0].date)}`
                : "Updates appear after review"}
            </small>
          </div>
          <div>
            <span>Authorized documents</span>
            <strong>{uploaded.toString().padStart(2, "0")}</strong>
            <small>Available for view and download</small>
          </div>
        </div>
        {project.status === "completed" && (
          <div className="client-completion-banner">
            <Icon name="check" />
            <div>
              <h3>Construction completed</h3>
              <p>
                {project.completedAt
                  ? `Closeout sign-offs completed on ${dateLabel(project.completedAt)}. `
                  : "This is a historical completed project record. "}
                Project records and authorized documents remain available in
                read-only form.
              </p>
            </div>
          </div>
        )}
        <Panel
          title="Your construction journey"
          subtitle="A clear view of the current phase and what comes next."
          actions={
            <Button
              variant="text-button"
              onClick={() => navigate("Phase Timeline")}
            >
              View timeline
              <Icon name="arrow" size={16} />
            </Button>
          }
        >
          <PhaseTimeline
            phase={project.phase}
            phases={project.phases}
            completed={project.status === "completed"}
          />
        </Panel>
        <div className="client-two-column">
          <Panel
            title="Schedule performance"
            subtitle="Illustrative planned-versus-actual schedule curves."
            actions={<Badge>Sample schedule</Badge>}
          >
            <Chart compact seed={73 + projects.indexOf(project) * 29} />
            <p className="client-chart-disclaimer">
              Schedule charts are source-supported illustrative data, not live
              commitments. Recorded project completion is shown separately
              above.
            </p>
          </Panel>
          <Panel
            title={`Activity status · ${project.phase}`}
            subtitle="Read-only checklist status. No internal review notes or evidence files."
          >
            {checklist()}
          </Panel>
        </div>
        <Panel
          title="Latest approved progress"
          subtitle="Only reviewed or baseline records are shown."
          actions={
            <Button
              variant="text-button"
              onClick={() => navigate("Progress History")}
            >
              View history
              <Icon name="arrow" size={16} />
            </Button>
          }
        >
          {historyList(true)}
        </Panel>
        <Panel
          title="Project documents"
          subtitle="Your authorized permits, plans and clearances."
          actions={
            <Button
              variant="text-button"
              onClick={() => navigate("Project Documents")}
            >
              Open repository
              <Icon name="arrow" size={16} />
            </Button>
          }
        >
          {documents(true)}
        </Panel>
        <Panel
          title="Site photographs"
          subtitle="Shared project imagery, separate from internal inspection evidence."
          actions={
            <Button
              variant="text-button"
              onClick={() => navigate("Site Photographs")}
            >
              View gallery
              <Icon name="arrow" size={16} />
            </Button>
          }
        >
          {photos(true)}
        </Panel>
        <Panel
          title="Your project contacts"
          subtitle="For questions about your approved project information."
        >
          <div className="client-contacts">
            {project.contacts.map((contact) => (
              <div key={contact.role}>
                <span className="avatar large">{initials(contact.name)}</span>
                <div>
                  <strong>{contact.name}</strong>
                  <p>{contact.role}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </>
    )
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
                    disabled={actor.status !== "active"}
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
                Contact your Administrator for account or access changes.
                Production authentication and password reset are not configured
                in this local demo.
              </p>
            </div>
          </Panel>
        </>
      )
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
    if (page === "Phase Timeline")
      return (
        <>
          <Panel
            title="Read-only phase timeline"
            subtitle={`${project.phases.length} construction phases. Every next phase depends on prior approvals and a confirmed owner.`}
          >
            <PhaseTimeline
              phase={project.phase}
              phases={project.phases}
              completed={project.status === "completed"}
              detailed
            />
          </Panel>
          <Panel
            title={`Current phase activity · ${project.phase}`}
            subtitle="Approval status only. No internal QA/QC files or rejection notes."
          >
            {checklist()}
          </Panel>
        </>
      )
    if (page === "Schedule Performance")
      return (
        <>
          <div className="notice">
            <Icon name="activity" />
            <p>
              These planned-versus-actual curves are illustrative, as in the
              source prototype. They do not change the recorded project progress
              of {project.progress}% or authorize schedule commitments.
            </p>
          </div>
          <Panel
            title={project.name}
            subtitle={`Current phase: ${project.phase} · Recorded completion: ${project.progress}%`}
          >
            <Chart seed={73 + projects.indexOf(project) * 29} />
          </Panel>
        </>
      )
    if (page === "Project Documents")
      return (
        <Panel
          title="Authorized project repository"
          subtitle={`${uploaded} uploaded records available · Client-visible documents only`}
        >
          {documents()}
        </Panel>
      )
    if (page === "Progress History")
      return (
        <Panel
          title="Approved project history"
          subtitle="Pending updates, internal notes and staff review queues are excluded."
          actions={
            <Button variant="primary" icon="download" onClick={report}>
              Download progress report
            </Button>
          }
        >
          {historyList()}
        </Panel>
      )
    return (
      <Panel
        title="Shared site photographs"
        subtitle="Photographs explicitly made available by the project team."
      >
        {photos()}
      </Panel>
    )
  }
  return (
    <div className="app-shell client-portal">
      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">
            <Icon name="building" size={28} />
          </span>
          <div>
            SITELINE<small>Project operations</small>
          </div>
        </div>
        <div className="workspace-switch">
          <span className="workspace-avatar">10</span>
          <span>
            <strong>10 Builders</strong>
            <small>Client project portal</small>
          </span>
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
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="client-privacy-card">
          <Icon name="shield" />
          <strong>Your view. Your project.</strong>
          <p>
            A read-only view of approved progress and documents authorized for
            you.
          </p>
        </div>
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
              aria-label={demoMode ? "Leave Client demo session" : "Sign out"}
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
              variant="icon-button"
              icon="menu"
              aria-label="Open Client navigation"
              onClick={() => setMobileNav(!mobileNav)}
            />
            <span>Client Portal</span>
            <Icon name="chevron" size={14} />
            <strong>{page}</strong>
          </div>
          <div className="topbar-actions">
            {demoMode && (
              <DemoSessionPicker
                sessions={sessions}
                value={actor.id}
                onChange={onSwitch}
              />
            )}
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
                    <h3>Approved project updates</h3>
                    <Button
                      variant="text-button"
                      onClick={() => onRead(notices.map((item) => item.id))}
                    >
                      Mark all read
                    </Button>
                  </div>
                  {notices.slice(0, 8).map((item) => (
                    <button
                      className="activity-item"
                      key={item.id}
                      onClick={() => {
                        onRead([item.id])
                        setProjectId(item.projectId)
                        navigate("Progress History")
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
                  ))}
                  {notices.length === 0 && (
                    <Empty title="No approved updates yet" />
                  )}
                </div>
              )}
            </div>
            <span className="avatar">{initials(actor.name)}</span>
          </div>
        </header>
        <main className="main-content">
          <div className="workspace-meta">
            <span>
              <i className="status-dot green" />
              CLIENT PORTAL <span className="mid-dot">/</span> Read-only access
            </span>
            <span>
              <Icon name="calendar" size={16} />
              {dateLabel(today())}
            </span>
          </div>
          {project && (
            <div className="client-project-toolbar">
              <Field label="Your authorized project">
                <select
                  value={project.id}
                  onChange={(event) => {
                    setProjectId(event.target.value)
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
              <Button icon="download" onClick={report}>
                Download progress report
              </Button>
            </div>
          )}
          {page !== "Project Overview" && project && (
            <div className="page-heading">
              <div>
                <div className="eyebrow">{project.name}</div>
                <h1>
                  {page}
                  <span className="heading-dot">.</span>
                </h1>
                <p>
                  Authorized information for your assigned project. No editing
                  access.
                </p>
              </div>
              <Badge>Read only</Badge>
            </div>
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
          {pageContent()}
          <div className="workspace-footer">
            <span>
              SITELINE <span>Built for the work ahead.</span>
            </span>
            <span>
              Local demo · Secure authentication and storage require backend
              services
            </span>
          </div>
        </main>
      </div>
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
            <p>Your Client demo session is paused.</p>
            <Button variant="primary" onClick={onResume}>
              Resume Client demo
            </Button>
            <small>
              This is simulated access, not production authentication.
            </small>
          </div>
        </div>
      )}
    </div>
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
        <Icon name="search" size={17} />
      </div>
    </button>
  )
}

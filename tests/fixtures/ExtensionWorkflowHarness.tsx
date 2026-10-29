import { useState, type ReactNode } from "react"
// Test-only harness for the approved frontend workflow. Never imported by the app.
import RoleWorkspace from "../../src/RoleWorkspace"
import ClientPortal from "../../src/ClientPortal"
import ActiveSites from "../../src/ActiveSites"
import ExtensionWorkflow from "../../src/ExtensionWorkflow"
import ExtensionDemoProvider, { useExtensionDemo } from "../../src/ExtensionDemoContext"
import { clientProjectViews } from "../../src/client-access"
import {
  DEMO_ACCOUNTS,
  DEMO_TODAY,
  extensionWorkspace,
  type DemoActor,
} from "../../src/extension-demo"
import { Badge, Button, Field, Icon, Modal } from "../../src/ui"
import { dateLabel, ROLE_NAMES } from "../../src/model"
import "../../src/extension-demo.css"

function DemoWorkspace({ onExit }: { onExit: () => void }) {
  const demo = useExtensionDemo()!
  const [accountId, setAccountId] = useState(() => {
    try {
      return localStorage.getItem("siteline-extension-demo-account") || "a5"
    } catch {
      return "a5"
    }
  })
  const [reset, setReset] = useState(false)
  const [noticesOpen, setNoticesOpen] = useState(false)
  const [adminProject, setAdminProject] = useState("")
  const [adminNavOpen, setAdminNavOpen] = useState(false)
  const actor: DemoActor =
    DEMO_ACCOUNTS.find((a) => a.id === accountId) || DEMO_ACCOUNTS[0]
  const state = extensionWorkspace(demo.state)
  const account = state.accounts.find((a) => a.id === actor.id)!
  const notices = demo.state.notices.filter((n) => n.to.includes(actor.id))
  const unread = notices.filter((n) => !n.readBy.includes(actor.id)).length
  function switchAccount(id: string) {
    setAccountId(id)
    setNoticesOpen(false)
    setAdminProject("")
    try {
      localStorage.setItem("siteline-extension-demo-account", id)
    } catch {
      /* In-memory switching remains available. */
    }
  }
  const exit = () => {
    onExit()
    const url = new URL(window.location.href)
    url.searchParams.delete("extensionDemo")
    window.history.replaceState(null, "", url)
  }
  const shared = {
    paused: false,
    idleWarning: false,
    onStayActive() {},
    onResume: exit,
    onPause: exit,
  }
  return (
    <div className="extension-demo-mode">
      <div
        className="extension-demo-toolbar"
        role="region"
        aria-label="Isolated extension demo controls"
      >
        <div>
          <Badge>{import.meta.env.DEV ? "DEVELOPMENT DEMO" : "FRONTEND DEMO"}</Badge>
          <p>
            Dummy data only · Schedule evaluated as of {dateLabel(DEMO_TODAY)}
          </p>
          <small>
            SPM: Active sites · OPM: Deadlines · Client: Project Overview ·
            Admin: Active sites
          </small>
        </div>
        <Field label="Demo account">
          <select
            value={actor.id}
            onChange={(e) => switchAccount(e.target.value)}
          >
            {DEMO_ACCOUNTS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {ROLE_NAMES[a.role]}
              </option>
            ))}
          </select>
        </Field>
        <div className="button-group">
          <Button icon="bell" onClick={() => setNoticesOpen(true)}>
            Demo notifications ({unread})
          </Button>
          <Button onClick={() => setReset(true)}>Reset Demo Data</Button>
          <Button onClick={exit}>Exit Demo</Button>
        </div>
        {demo.storageMessage && <p role="alert">{demo.storageMessage}</p>}
      </div>
      {actor.role === "spm" || actor.role === "opm" ? (
        <RoleWorkspace
          key={actor.id}
          state={state}
          actor={account}
          extensionDemo
          onCommand={() => ({
            ok: false,
            error:
              "This isolated prototype supports extension requests only. Construction phase and document validation are unchanged.",
          })}
          onRead={() => {}}
          onMute={() => {}}
          onReload={() => {}}
          {...shared}
        />
      ) : actor.role === "client" ? (
        <ClientPortal
          key={actor.id}
          actor={account}
          projects={clientProjectViews(state, actor.id)}
          readNoticeIds={[]}
          mutedTypes={[]}
          onMute={() => {}}
          onRead={() => {}}
          onResolve={() => {
            throw Error("No server attachments in this demo.")
          }}
          onReport={() =>
            "Extension workflow demo. No production records included."
          }
          onRecord={() => {}}
          {...shared}
        />
      ) : (
        <div className="app-shell">
          <aside className={`sidebar ${adminNavOpen ? "mobile-open" : ""}`}>
            <div className="workspace-switch">
              <span className="workspace-avatar">10</span>
              <span>
                <strong>10 Builders</strong>
                <small>Administrator workspace · Demo</small>
              </span>
            </div>
            <div className="brand">
              BuildAxis<small>10 BUILDERS</small>
            </div>
            <nav aria-label="Admin demo navigation">
              <Button
                className="nav-item active"
                icon="building"
                onClick={() => {
                  setAdminProject("")
                  setAdminNavOpen(false)
                }}
              >
                Active sites
              </Button>
            </nav>
            <div className="sidebar-bottom">
              <div className="sidebar-person">
                <span>
                  <strong>{actor.name}</strong>
                  <small>Read-only monitoring</small>
                </span>
              </div>
            </div>
          </aside>
          {adminNavOpen && (
            <div
              className="mobile-nav-backdrop"
              onClick={() => setAdminNavOpen(false)}
            />
          )}
          <div className="main-shell">
            <header className="topbar">
              <div className="breadcrumb">
                <Button
                  className="mobile-menu"
                  icon="menu"
                  aria-label="Open Admin demo navigation"
                  onClick={() => setAdminNavOpen(!adminNavOpen)}
                />
                <span>Administrator</span>
                <Icon name="chevron" />
                <strong>Active sites</strong>
              </div>
            </header>
            <main className="main-content">
              <div className="page-heading">
                <h1>Active sites</h1>
              </div>
              <ExtensionWorkflow actor={actor} />
              <ActiveSites projects={state.projects} onOpen={setAdminProject} />
              {adminProject && (
                <Modal
                  wide
                  title={
                    state.projects.find((p) => p.id === adminProject)?.name ||
                    "Demo project"
                  }
                  onClose={() => setAdminProject("")}
                >
                  <ExtensionWorkflow actor={actor} projectId={adminProject} />
                </Modal>
              )}
            </main>
          </div>
        </div>
      )}
      {noticesOpen && (
        <Modal
          title="Simulated extension notifications"
          subtitle={actor.name}
          onClose={() => setNoticesOpen(false)}
        >
          <p>
            Demo messages are isolated from the application's live notification
            service.
          </p>
          <Button
            onClick={() =>
              demo.execute(actor, {
                type: "read",
                noticeIds: notices.map((n) => n.id),
              })
            }
          >
            Mark all demo notifications read
          </Button>
          {notices.length ? (
            <ul className="extension-notices">
              {notices.map((n) => (
                <li key={n.id}>
                  <Badge>
                    {n.readBy.includes(actor.id) ? "Read" : "Unread"}
                  </Badge>
                  <p>{n.text}</p>
                  <small>{dateLabel(n.at)}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p>No demo notifications for this account yet.</p>
          )}
        </Modal>
      )}
      {reset && (
        <Modal title="Reset Demo Data" onClose={() => setReset(false)}>
          <p>
            Restore the five initial demo projects, sample requests and first
            approved deadline. Saved demo drafts, decisions, attachments and
            notifications will be cleared.
          </p>
          <div className="modal-actions">
            <Button onClick={() => setReset(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                demo.reset()
                setReset(false)
                setAdminProject("")
              }}
            >
              Confirm Reset Demo Data
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default function ExtensionDemo({
  children,
  enabled = import.meta.env.DEV || import.meta.env.MODE === "extension-demo",
}: {
  children: ReactNode
  enabled?: boolean
}) {
  const [active, setActive] = useState(
    () =>
      enabled &&
      new URLSearchParams(window.location.search).get("extensionDemo") === "1",
  )
  if (!enabled) return children
  if (active)
    return (
      <ExtensionDemoProvider>
        <DemoWorkspace onExit={() => setActive(false)} />
      </ExtensionDemoProvider>
    )
  return (
    <>
      {children}
      <Button
        className="extension-demo-launch"
        icon="clock"
        onClick={() => {
          const url = new URL(window.location.href)
          url.searchParams.set("extensionDemo", "1")
          window.history.replaceState(null, "", url)
          setActive(true)
        }}
      >
        Extension Workflow Demo · {import.meta.env.DEV ? "Development Only" : "Demo Only"}
      </Button>
    </>
  )
}

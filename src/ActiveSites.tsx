import { useEffect, useMemo, useState, type ReactNode } from "react"

import { PROJECT_TYPES, dateLabel, timelineStatus } from "./model"

import { downloadApiFile } from "./api/client"

import { Badge, Button, Empty } from "./ui"

import "./active-sites.css"

export type SiteCard = {
  id: string

  name: string

  type: string

  phase: string

  status: string

  progress: number

  start: string

  end?: string

  lead?: string

  photoId?: string

  needsReview?: boolean
}

function SiteImage({ project }: { project: SiteCard }) {
  const [source, setSource] = useState("")

  const placeholder = `${import.meta.env.BASE_URL}images/site-${
    project.type === "Residential"
      ? "residential"
      : project.type === "Mixed-Use"
        ? "mixed"
        : "commercial"
  }.svg`

  useEffect(() => {
    let cancelled = false

    let url = ""

    setSource("")

    if (project.photoId)
      void downloadApiFile(project.photoId)
        .then((blob) => {
          if (cancelled || !blob || !blob.type.startsWith("image/")) return

          url = URL.createObjectURL(blob)

          setSource(url)
        })
        .catch(() => {
          /* An unavailable photo keeps the local placeholder. */
        })

    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [project.photoId])

  return (
    <div className="as-image">
      <img
        src={source || placeholder}
        alt={
          source
            ? `${project.name} site photograph`
            : `${project.type} architectural illustration`
        }
        loading="lazy"
        decoding="async"
        width="720"
        height="400"
        onError={() => setSource("")}
      />
      <span className="as-image-label">
        {source ? "SITE PHOTOGRAPH" : "PROJECT TYPE ILLUSTRATION"}
      </span>
      <Badge tone="green">{project.status.replace(/_/g, " ")}</Badge>
    </div>
  )
}

// Accept only the caller's existing authorized projection, never global state.

export default function ActiveSites({
  projects,
  onOpen,
  renderActions,
}: {
  projects: SiteCard[]

  onOpen: (id: string) => void

  renderActions?: (id: string) => ReactNode
}) {
  const [query, setQuery] = useState("")

  const [type, setType] = useState("")

  const [phase, setPhase] = useState("")

  const [status, setStatus] = useState("")

  const [sort, setSort] = useState("name")

  const [size, setSize] = useState(6)

  const [page, setPage] = useState(1)

  const [recent, setRecent] = useState<string[]>([])

  const phases = [...new Set(projects.map((p) => p.phase))].sort()

  const statuses = [...new Set(projects.map((p) => p.status))].sort()

  const filtered = useMemo(
    () =>
      projects
        .filter(
          (p) =>
            p.name
              .toLocaleLowerCase()
              .includes(query.trim().toLocaleLowerCase()) &&
            (!type || p.type === type) &&
            (!phase || p.phase === phase) &&
            (!status || p.status === status),
        )
        .sort((a, b) => {
          if (sort === "progress")
            return b.progress - a.progress || a.name.localeCompare(b.name)

          if (sort === "end")
            return (
              (a.end || "9999").localeCompare(b.end || "9999") ||
              a.name.localeCompare(b.name)
            )

          return a.name.localeCompare(b.name)
        }),
    [projects, query, type, phase, status, sort],
  )

  const pages = Math.max(1, Math.ceil(filtered.length / size))

  const current = Math.min(page, pages)

  const visible = filtered.slice((current - 1) * size, current * size)

  const recorded = projects.filter((p) => Number.isFinite(p.progress))

  const scheduleFor = (p: SiteCard) =>
    Number.isFinite(p.progress) &&
    Number.isFinite(Date.parse(p.start)) &&
    p.end &&
    Number.isFinite(Date.parse(p.end))
      ? timelineStatus(p)
      : null

  const schedules = recorded.map(scheduleFor).filter((s) => s !== null)

  const onSchedule = schedules.filter((s) => s.label === "On schedule").length

  const attention = projects.filter(
    (p) =>
      p.needsReview || ["amber", "red"].includes(scheduleFor(p)?.tone || ""),
  ).length

  const open = (id: string) => {
    if (!projects.some((p) => p.id === id)) return

    setRecent((previous) =>
      [id, ...previous.filter((x) => x !== id)].slice(0, 3),
    )

    onOpen(id)
  }

  const reset = () => {
    setQuery("")
    setType("")
    setPhase("")
    setStatus("")
    setPage(1)
  }

  return (
    <section className="active-sites" aria-label="Active project dashboard">
      <div className="as-summary">
        <div>
          <span>Active projects</span>
          <strong>{projects.length}</strong>
          <small>Within your access</small>
        </div>
        <div>
          <span>Average recorded progress</span>
          <strong>
            {recorded.length
              ? `${Math.round(recorded.reduce((sum, p) => sum + p.progress, 0) / recorded.length)}%`
              : "—"}
          </strong>
          <small>Recorded completion only</small>
        </div>
        {schedules.length > 0 && (
            <div>
              <span>On schedule</span>
              <strong>{onSchedule}</strong>
              <small>Planned timeline · {schedules.length} dated projects</small>
            </div>
        )}
        {(schedules.length > 0 || projects.some(p => p.needsReview !== undefined)) && (
            <div>
              <span>Requiring attention</span>
              <strong>{attention}</strong>
              <small>{projects.some(p => p.needsReview !== undefined) ? "Timeline delay or pending review" : "Based on planned timeline"}</small>
            </div>
        )}
      </div>
      {recent.some((id) => projects.some((p) => p.id === id)) && (
        <div className="as-recent">
          <span>Recently viewed</span>
          {recent
            .map((id) => projects.find((p) => p.id === id))
            .filter((p) => p !== undefined)
            .map((p) => (
              <button key={p.id} onClick={() => open(p.id)}>
                {p.name} <span aria-hidden="true">↗</span>
              </button>
            ))}
        </div>
      )}
      <div className="as-toolbar">
        <label className="as-search">
          Search projects
          <input
            type="search"
            placeholder="Search by project name…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(1)
            }}
          />
        </label>
        <label>
          Project type
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All types</option>
            {PROJECT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Current phase
          <select
            value={phase}
            onChange={(e) => {
              setPhase(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All phases</option>
            {phases.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sort by
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value)
              setPage(1)
            }}
          >
            <option value="name">Project name A–Z</option>
            <option value="progress">Progress: highest first</option>
            <option value="end">Target date: earliest first</option>
          </select>
        </label>
      </div>
      <div className="as-results" role="status">
        {filtered.length} {filtered.length === 1 ? "project" : "projects"}
        {(query || type || phase || status) && (
          <Button variant="text-button" onClick={reset}>
            Clear filters
          </Button>
        )}
      </div>
      <div className="as-grid">
        {visible.map((p) => (
          <article className="as-card" key={p.id}>
            <SiteImage project={p} />
            <div className="as-card-body">
              <span className="as-type">{p.type}</span>
              <h2>{p.name}</h2>
              <p className="as-phase">{p.phase || "Phase not recorded"}</p>
              <div className="as-progress-label">
                <span>Recorded progress</span>
                <strong>
                  {Number.isFinite(p.progress)
                    ? `${p.progress}%`
                    : "Not recorded"}
                </strong>
              </div>
              <progress
                aria-label={`${p.name} recorded progress`}
                max={100}
                value={Number.isFinite(p.progress) ? p.progress : undefined}
              />
              <dl>
                {p.lead && (
                  <div>
                    <dt>Lead Site PM</dt>
                    <dd>{p.lead}</dd>
                  </div>
                )}
                <div>
                  <dt>Target completion</dt>
                  <dd>{p.end ? dateLabel(p.end) : "Not set"}</dd>
                </div>
              </dl>
              {p.needsReview && (
                <p className="as-review">Update or issue awaiting review</p>
              )}
              <Button variant="primary" onClick={() => open(p.id)}>
                View Project Details <span aria-hidden="true">↗</span>
              </Button>
              {renderActions?.(p.id)}
            </div>
          </article>
        ))}
      </div>
      {!visible.length && (
        <Empty
          title={
            projects.length ? "No matching projects" : "No active sites yet"
          }
        >
          {projects.length
            ? "Try another name or clear the filters."
            : "Authorized projects will appear here once activated."}
        </Empty>
      )}
      <nav className="as-pagination" aria-label="Project pagination">
        <label>
          Projects per page
          <select
            value={size}
            onChange={(e) => {
              setSize(Number(e.target.value))
              setPage(1)
            }}
          >
            {[6, 12, 24].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <span aria-live="polite">
          {filtered.length
            ? `${(current - 1) * size + 1}–${Math.min(current * size, filtered.length)} of ${filtered.length}`
            : "0 projects"}{" "}
          · Page {current} of {pages}
        </span>
        <div>
          <Button disabled={current === 1} onClick={() => setPage(current - 1)}>
            Previous
          </Button>
          <Button
            disabled={current === pages}
            onClick={() => setPage(current + 1)}
          >
            Next
          </Button>
        </div>
      </nav>
    </section>
  )
}

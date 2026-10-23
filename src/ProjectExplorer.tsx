import type { ReactNode } from "react"
import { Badge, Button, Empty, Icon } from "./ui"
import {
  ListSection,
  getListQuery,
  runList,
  updateListQuery,
  type ListStatus,
} from "./ListControls"
import { optionsFrom, withFilter, type FilterDef } from "./listing"
import {
  EXPLORER_PAGE_SIZES,
  SORT_OPTIONS,
  explorerCounters,
  readRecents,
  sortProjects,
  statusLabel,
  visibleRecents,
  type ExplorerProject,
} from "./explorerHelpers"

export type ExplorerItem = {
  project: ExplorerProject
  // Shown instead of "type · phase" when the caller has no separate type/phase.
  subtitle?: string
  // Line on the card; "action" means the signed-in user must act (text, never color alone).
  status?: { label: string; tone: "action" | "success" | "neutral" }
}

const files = (count: number) =>
  `${count} original file${count === 1 ? "" : "s"}`

/** One compact project card: folder icon, name, type · phase, file count and Explore. */
export function ProjectCard({
  item,
  onExplore,
}: {
  item: ExplorerItem
  onExplore: (projectId: string) => void
}) {
  const { project, status, subtitle } = item
  const meta =
    [project.type, project.phase].filter(Boolean).join(" · ") || subtitle || ""
  return (
    <article
      className={`explorer-card ${status?.tone === "action" ? "action-required" : ""}`}
    >
      <span className="explorer-card-icon" aria-hidden="true">
        <Icon name="folder" size={26} />
      </span>
      <div className="explorer-card-body">
        <h3>{project.name}</h3>
        <div className="explorer-card-details">
          {meta && <p className="explorer-card-meta">{meta}</p>}
          <p className="explorer-card-files">
            <Icon name="doc" size={15} />
            {files(project.fileCount)}
          </p>
        </div>
        {status?.tone === "action" && (
          <Badge tone="amber">Action Required</Badge>
        )}
      </div>
      <div className="explorer-card-footer">
        {status && (
          <small className={`document-status-line ${status.tone}`}>
            {status.tone === "success" ? (
              <Badge tone="green">{status.label}</Badge>
            ) : (
              status.label
            )}
          </small>
        )}
        <Button
          className="explorer-card-action"
          aria-label={`Explore ${project.name}`}
          onClick={() => onExplore(project.id)}
        >
          Explore
          <Icon name="arrow" size={16} />
        </Button>
      </div>
    </article>
  )
}

/**
 * The project level of the document repository for every role. It receives only
 * the projects the signed-in role may open (the backend scopes them), so the
 * counters, search, filters and recents can never show anything else. Search and
 * filters run first; pagination (6 / 12 / 24 cards) is applied to the result.
 */
export default function ProjectExplorer({
  listKey,
  items,
  recentKey,
  onExplore,
  status = { state: "ready" },
  emptyDetail = "Projects appear here once you are assigned to them.",
}: {
  listKey: string
  items: ExplorerItem[]
  // Account key for "Recently accessed" (just project ids, kept in this browser).
  recentKey: string
  onExplore: (projectId: string) => void
  status?: ListStatus
  emptyDetail?: ReactNode
}) {
  const key = `${listKey}:projects`
  const all = items.map((item) => item.project)
  const counters = explorerCounters(all)
  const byId = new Map(items.map((item) => [item.project.id, item]))
  const recents = visibleRecents(readRecents(recentKey), all)

  const sort = getListQuery(key, EXPLORER_PAGE_SIZES[0]).filters.sort || "name"
  const ordered = sortProjects(all, sort).map((p) => byId.get(p.id)!)
  const statuses = all.map((p) => (p.status ? statusLabelValue(p.status) : ""))
  const filters: FilterDef<ExplorerItem>[] = [
    {
      id: "type",
      label: "Project type",
      allLabel: "All types",
      options: optionsFrom(all.map((p) => p.type || "")),
      test: ({ project }, value) => project.type === value,
    },
  ]
  if (statuses.some(Boolean))
    filters.push({
      id: "status",
      label: "Status",
      allLabel: "All statuses",
      options: optionsFrom(statuses),
      test: ({ project }, value) =>
        !!project.status && statusLabelValue(project.status) === value,
    })
  const list = {
    ...runList(
      key,
      ordered,
      {
        searchText: ({ project }) =>
          `${project.name} ${project.type || ""} ${project.phase || ""} ${project.searchText}`,
        filters,
      },
      { pageSize: EXPLORER_PAGE_SIZES[0], pageSizes: EXPLORER_PAGE_SIZES },
    ),
    status,
  }

  const sortControl = (
    <label className="list-filter">
      <span>Sort by</span>
      <select
        value={sort}
        onChange={(event) =>
          updateListQuery(
            key,
            (q) =>
              withFilter(
                q,
                "sort",
                event.target.value === "name" ? "all" : event.target.value,
              ),
            EXPLORER_PAGE_SIZES[0],
          )
        }
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <div className="project-explorer">
      <dl className="explorer-counters" aria-label="Repository summary">
        <div>
          <dt>Accessible projects</dt>
          <dd>{counters.projects}</dd>
        </div>
        <div>
          <dt>Original files</dt>
          <dd>{counters.files}</dd>
        </div>
        <div>
          <dt>Empty repositories</dt>
          <dd>{counters.empty}</dd>
        </div>
      </dl>
      {recents.length > 0 && (
        <section className="explorer-recent" aria-label="Recently accessed">
          <h3>Recently accessed</h3>
          <div className="explorer-grid">
            {recents.map((project) => (
              <ProjectCard
                key={project.id}
                item={byId.get(project.id)!}
                onExplore={onExplore}
              />
            ))}
          </div>
        </section>
      )}
      <ListSection
        list={list}
        placeholder="Search projects or documents"
        noun="project"
        unit="projects"
        toolbarExtra={sortControl}
        empty={<Empty title="No projects available.">{emptyDetail}</Empty>}
        render={(page) => (
          <div className="explorer-grid">
            {page.map((item) => (
              <ProjectCard
                key={item.project.id}
                item={item}
                onExplore={onExplore}
              />
            ))}
          </div>
        )}
      />
    </div>
  )
}

// Filter values are the readable status text ("In progress"), never the raw code.
const statusLabelValue = (status: string) => statusLabel(status)

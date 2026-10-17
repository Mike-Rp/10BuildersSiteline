import { useState, type ReactNode } from "react"
import { dateLabel } from "./model"
import { Badge, Button, Empty, Icon } from "./ui"
import type { Doc } from "./model"
import type { ProjectDocumentCategory } from "./project-document-index"

// Shared four-level repository browser: Projects → Categories → Subfolders →
// Files. Callers pass only what the signed-in role may open, so counts always
// match the files shown. Files are original records referenced by id.
export type RepositoryFile = {
  id: string
  label: string
  name: string
  date?: string
  owner?: string
  source?: string
  downloadable?: boolean
  reviewStatus?: string
}
export type RepositoryFolder = {
  id: string
  name: string
  description: string
  files: RepositoryFile[]
}
export type RepositoryCategory = {
  id: string
  name: string
  description: string
  folders: RepositoryFolder[]
  fileCount: number
}
export type RepositoryProject = {
  id: string
  name: string
  subtitle: string
  categories: RepositoryCategory[]
}
export type RepositoryPath = {
  projectId?: string
  categoryId?: string
  folderId?: string
}

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`
const projectFileCount = (project: RepositoryProject) =>
  project.categories.reduce((total, c) => total + c.fileCount, 0)

export default function DocumentRepository({
  projects,
  onOpen,
  onDownload,
  className = "",
  rootLabel = "Projects",
  rootClickable = false,
  projectSubtitle,
  projectIntro,
  projectStatus,
  lockedProjectId,
  path: controlledPath,
  onPathChange,
  query: controlledQuery,
  onQueryChange,
  searchInProject = false,
  fileDetails = false,
  renderStatus,
  emptyDetail = "Original uploads appear here when the responsible role submits them.",
}: {
  projects: RepositoryProject[]
  onOpen: (projectId: string, fileId: string) => void
  onDownload?: (projectId: string, fileId: string) => void
  className?: string
  // Optional per-project content, shown when a project (not a category or
  // subfolder) is open. The first breadcrumb can name the page and link back.
  rootLabel?: string
  rootClickable?: boolean
  projectSubtitle?: (projectId: string) => string
  projectIntro?: (projectId: string) => ReactNode
  // Status line on each project card. "action" highlights the card because the
  // signed-in user must act; the label is always text, never color alone.
  projectStatus?: (projectId: string) => {
    label: string
    tone: "action" | "success" | "neutral"
  }
  // Open this project directly and never show the project cards.
  lockedProjectId?: string
  // Controlled navigation and search, so a parent can keep them while it
  // switches to another view. Without these, state is local and resets when
  // the browser is mounted again.
  path?: RepositoryPath
  onPathChange?: (path: RepositoryPath) => void
  query?: string
  onQueryChange?: (query: string) => void
  // Search inside the open project (categories, subfolders and files).
  searchInProject?: boolean
  // Show type, uploader, date, source and review status on file rows.
  fileDetails?: boolean
  renderStatus?: (value: string) => ReactNode
  emptyDetail?: string
}) {
  const [ownPath, setOwnPath] = useState<RepositoryPath>({})
  const [ownQuery, setOwnQuery] = useState("")
  const path = controlledPath ?? ownPath
  const setPath = onPathChange ?? setOwnPath
  const query = controlledQuery ?? ownQuery
  const setQuery = onQueryChange ?? setOwnQuery
  const project = projects.find(
    (p) => p.id === (lockedProjectId ?? path.projectId),
  )
  const category = project?.categories.find((c) => c.id === path.categoryId)
  const folder = category?.folders.find((f) => f.id === path.folderId)

  const term = query.trim().toLowerCase()
  const fileMatches = (file: RepositoryFile) =>
    `${file.label} ${file.name} ${file.source || ""}`
      .toLowerCase()
      .includes(term)
  const inProject = searchInProject && !!project && !!term
  const visibleProjects = projects.filter(
    (p) =>
      !term ||
      p.name.toLowerCase().includes(term) ||
      p.categories.some((c) =>
        c.folders.some((f) =>
          f.files.some((file) =>
            `${file.label} ${file.name}`.toLowerCase().includes(term),
          ),
        ),
      ),
  )
  const visibleCategories = (project?.categories || []).filter(
    (c) =>
      !inProject ||
      c.name.toLowerCase().includes(term) ||
      c.folders.some(
        (f) => f.name.toLowerCase().includes(term) || f.files.some(fileMatches),
      ),
  )
  const visibleFolders = (category?.folders || []).filter(
    (f) =>
      !inProject ||
      f.name.toLowerCase().includes(term) ||
      f.files.some(fileMatches),
  )
  const visibleFiles = (folder?.files || []).filter(
    (file) =>
      !inProject || folder?.name.toLowerCase().includes(term) || fileMatches(file),
  )

  function back() {
    if (folder) setPath({ projectId: project?.id, categoryId: path.categoryId })
    else if (category) setPath({ projectId: project?.id })
    else setPath({})
  }
  const showBack = !!project && !(lockedProjectId && !category)

  const title =
    folder?.name || category?.name || project?.name || "Project repository"
  const subtitle = folder
    ? folder.description
    : category
      ? category.description
      : project
        ? (projectSubtitle?.(project.id) ??
          "Choose a document category to continue.")
        : "Choose a project to browse its original records."
  const crumbs = [
    rootLabel,
    project?.name,
    category?.name,
    folder?.name,
  ].filter(Boolean) as string[]
  const searchField = (placeholder: string) => (
    <div className="search-field">
      <Icon name="search" size={18} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query && (
        <Button
          variant="icon-button"
          icon="close"
          aria-label="Clear search"
          onClick={() => setQuery("")}
        />
      )}
    </div>
  )
  const fileCountBadge = project && (
    <Badge>
      {plural(
        folder
          ? folder.files.length
          : category
            ? category.fileCount
            : projectFileCount(project),
        "file",
      )}
    </Badge>
  )

  return (
    <section className={`panel document-browser ${className}`}>
      <header className="panel-header">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        {!project ? (
          searchField("Find a project")
        ) : searchInProject ? (
          <div className="button-group">
            {searchField("Search documents")}
            {fileCountBadge}
          </div>
        ) : (
          fileCountBadge
        )}
      </header>
      {project && (
        <>
          {showBack && (
            <div className="document-browser-back">
              <Button variant="text-button" onClick={back}>
                ← Back
              </Button>
            </div>
          )}
          <nav
            className="document-browser-path"
            aria-label="Document repository path"
          >
            {crumbs.map((crumb, index) => (
              <span className="document-browser-crumb" key={index}>
                {index > 0 && <Icon name="chevron" size={14} />}
                {index === 0 && rootClickable ? (
                  <Button variant="text-button" onClick={() => setPath({})}>
                    {crumb}
                  </Button>
                ) : index === crumbs.length - 1 ? (
                  <strong aria-current="page">{crumb}</strong>
                ) : (
                  <span>{crumb}</span>
                )}
              </span>
            ))}
          </nav>
        </>
      )}

      {!project &&
        (!projects.length ? (
          <Empty title="No projects available.">
            Projects appear here once you are assigned to them.
          </Empty>
        ) : !visibleProjects.length ? (
          <Empty title="No projects match your search">
            Try another project name or document title.
          </Empty>
        ) : (
          <div className="document-browser-grid">
            {visibleProjects.map((p) => {
              const count = projectFileCount(p)
              const status = projectStatus?.(p.id)
              return (
                <Button
                  variant="document-nav-card"
                  className={status?.tone === "action" ? "action-required" : ""}
                  key={p.id}
                  onClick={() => setPath({ projectId: p.id })}
                >
                  <span className="document-nav-icon">
                    <Icon name="building" size={28} />
                  </span>
                  <span className="document-nav-copy">
                    <strong>{p.name}</strong>
                    <small>{p.subtitle}</small>
                    {status?.tone === "action" && (
                      <Badge tone="amber">Action Required</Badge>
                    )}
                    {status && (
                      <small
                        className={`document-status-line ${status.tone}`}
                      >
                        {status.tone === "success" ? (
                          <Badge tone="green">{status.label}</Badge>
                        ) : (
                          status.label
                        )}
                      </small>
                    )}
                  </span>
                  <span className="document-nav-meta">
                    {plural(count, "original file")}
                    <Icon name="arrow" size={17} />
                  </span>
                </Button>
              )
            })}
          </div>
        ))}

      {project && !category && projectIntro?.(project.id)}
      {project &&
        !category &&
        (!projectFileCount(project) ? (
          <Empty title="No documents available yet.">{emptyDetail}</Empty>
        ) : !visibleCategories.length ? (
          <Empty title="No documents match your search">
            Try another file name, category or subfolder.
          </Empty>
        ) : (
          <div className="document-browser-grid">
            {visibleCategories.map((c) => (
              <Button
                variant="document-nav-card"
                key={c.id}
                onClick={() =>
                  setPath({ projectId: project.id, categoryId: c.id })
                }
              >
                <span className="document-nav-icon">
                  <Icon name="folder" size={28} />
                </span>
                <span className="document-nav-copy">
                  <strong>{c.name}</strong>
                  <small>{c.description}</small>
                </span>
                <span className="document-nav-meta">
                  {plural(c.fileCount, "file")}
                  <Icon name="arrow" size={17} />
                </span>
              </Button>
            ))}
          </div>
        ))}

      {category &&
        !folder &&
        (!category.fileCount ? (
          <Empty title="No documents available yet.">{emptyDetail}</Empty>
        ) : !visibleFolders.length ? (
          <Empty title="No documents match your search">
            Try another file name or subfolder.
          </Empty>
        ) : (
          <div className="document-browser-grid">
            {visibleFolders.map((f) => (
              <Button
                variant="document-nav-card"
                key={f.id}
                onClick={() =>
                  setPath({
                    projectId: project!.id,
                    categoryId: category.id,
                    folderId: f.id,
                  })
                }
              >
                <span className="document-nav-icon compact">
                  <Icon name="folder" size={24} />
                </span>
                <span className="document-nav-copy">
                  <strong>{f.name}</strong>
                  <small>{f.description}</small>
                </span>
                <span className="document-nav-meta">
                  {plural(f.files.length, "file")}
                  <Icon name="arrow" size={17} />
                </span>
              </Button>
            ))}
          </div>
        ))}

      {folder &&
        (!folder.files.length ? (
          <Empty title="No documents available yet.">{emptyDetail}</Empty>
        ) : !visibleFiles.length ? (
          <Empty title="No documents match your search">
            Try another file name.
          </Empty>
        ) : (
          <div className="document-reference-list">
            {visibleFiles.map((file) => (
              <div className="document-reference-row" key={file.id}>
                <span className="file-icon">
                  <Icon name="doc" />
                </span>
                <div className="document-info">
                  <strong>{file.label}</strong>
                  {fileDetails ? (
                    <>
                      <p>{file.name}</p>
                      <small>
                        Type · {category!.name} › {folder.name}
                      </small>
                      <small>
                        Uploaded by {file.owner || "Not recorded"}
                        {file.date ? ` · ${dateLabel(file.date)}` : ""}
                      </small>
                      {file.source && <small>Source · {file.source}</small>}
                      <small>
                        Review status ·{" "}
                        {file.reviewStatus
                          ? (renderStatus?.(file.reviewStatus) ?? (
                              <Badge>{file.reviewStatus}</Badge>
                            ))
                          : "No review status recorded"}
                      </small>
                    </>
                  ) : (
                    <>
                      <p>
                        {[
                          file.name,
                          file.date && dateLabel(file.date),
                          file.owner,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {file.source && (
                        <small>
                          <Icon name="activity" size={14} />
                          Referenced from {file.source}
                        </small>
                      )}
                    </>
                  )}
                </div>
                <Button
                  variant="text-button"
                  onClick={() => onOpen(project!.id, file.id)}
                >
                  View original
                </Button>
                {onDownload && file.downloadable && (
                  <Button
                    variant="icon-button"
                    icon="download"
                    aria-label={`Download ${file.label}`}
                    onClick={() => onDownload(project!.id, file.id)}
                  />
                )}
              </div>
            ))}
          </div>
        ))}
    </section>
  )
}

// Adapts the staff document index (which holds canonical Doc records) to the
// browser, and finds a file again by id without copying anything. `statusFor`
// may return an existing stored review status for a file.
export function staffRepositoryCategories(
  categories: ProjectDocumentCategory[],
  statusFor?: (doc: Doc) => string | undefined,
  downloadable = false,
): RepositoryCategory[] {
  return categories.map((category) => ({
    ...category,
    folders: category.folders.map((folder) => ({
      ...folder,
      files: folder.files.map(({ doc, source }) => ({
        id: doc.id,
        label: doc.label,
        name: doc.name,
        date: doc.date,
        owner: doc.owner,
        source,
        reviewStatus: statusFor?.(doc),
        downloadable,
      })),
    })),
  }))
}
export function findIndexedDoc(
  categories: ProjectDocumentCategory[],
  fileId: string,
): Doc | undefined {
  for (const category of categories)
    for (const folder of category.folders)
      for (const file of folder.files) if (file.doc.id === fileId) return file.doc
  return undefined
}

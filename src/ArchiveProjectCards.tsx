import type { Project } from "./model"
import { dateLabel } from "./model"
import { Button, Badge } from "./ui"

export default function ArchiveProjectCards({ projects, closedDate, onOpen, highlightedId }: {
  highlightedId?: string; projects: Project[]; closedDate: (project: Project) => string; onOpen: (project: Project) => void
}) {
  return <div className="archive-project-cards">{projects.map(project => <article className={`archive-project-card ${highlightedId === project.id ? "search-result-highlight" : ""}`} key={project.id}>
    <header><div><h3>{project.name}</h3><p>{project.type} · {project.location || "Location not recorded"}</p></div>
      <Badge tone={project.status === "completed" ? "green" : "amber"}>{project.status === "completed" ? "Completed" : project.status === "expired" ? "Expired" : "Declined"}</Badge>
    </header>
    <dl><div><dt>Last Phase</dt><dd>{project.phase || "Not recorded"}</dd></div><div><dt>Record Date</dt><dd>{closedDate(project) ? dateLabel(closedDate(project)) : "Not recorded"}</dd></div></dl>
    <Button onClick={() => onOpen(project)}>View Record</Button>
  </article>)}</div>
}

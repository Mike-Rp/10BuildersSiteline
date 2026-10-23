import type { Account, Project } from "./model"
import { checklistFor, REVIEW_MS } from "./workflows"
import { Badge, Button, Icon } from "./ui"

const countLabel = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`

export default function ChecklistApprovalBanner({
  projects,
  actor,
  onReview,
  now = Date.now(),
}: {
  projects: Project[]
  actor: Account
  onReview: (project?: Project) => void
  now?: number
}) {
  if (actor.role !== "opm") return null
  const reviews = projects
    .filter(project => project.status === "active" && project.opmId === actor.id)
    .map(project => {
      const items = checklistFor(project).filter(item => item.status === "submitted")
      const deadlines = items
        .map(item => item.submittedAt ? Date.parse(item.submittedAt) + REVIEW_MS : NaN)
        .filter(Number.isFinite)
      return { project, count: items.length, deadlines, due: deadlines.length ? Math.min(...deadlines) : undefined }
    })
    .filter(review => review.count > 0)
    .sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity) || a.project.name.localeCompare(b.project.name))
  if (!reviews.length) return null

  const total = reviews.reduce((sum, review) => sum + review.count, 0)
  const deadlines = reviews.flatMap(review => review.deadlines)
  const overdue = deadlines.filter(due => due <= now).length
  const dueSoon = deadlines.filter(due => due > now && due <= now + 86_400_000).length
  const urgent = overdue > 0

  return (
    <section className={`checklist-approval-banner${urgent ? " overdue" : ""}`} aria-label="Checklist approval deadlines">
      <div className="checklist-approval-heading">
        <span className="checklist-approval-icon"><Icon name={urgent ? "alert" : "shield"} size={25} /></span>
        <div className="checklist-approval-copy">
          <span className="checklist-approval-eyebrow">Your approval required</span>
          <h2>Checklist approvals need your attention</h2>
          <p>{countLabel(total, "checklist activity", "checklist activities")} across {countLabel(reviews.length, "project")} {total === 1 ? "is" : "are"} waiting for your approval.</p>
          <div className="checklist-approval-summary">
            {overdue > 0 && <Badge tone="red">{overdue} overdue</Badge>}
            {dueSoon > 0 && <Badge tone="amber">{dueSoon} due within 24 hours</Badge>}
            <span>Review evidence within 3 days of submission.</span>
          </div>
        </div>
        <Button variant="primary" icon="arrow" onClick={() => onReview()}>Review approvals</Button>
      </div>
      <div className="checklist-approval-projects">
        {reviews.slice(0, 3).map(({ project, count, due }) => (
          <button key={project.id} className="checklist-approval-project" onClick={() => onReview(project)} aria-label={`Review checklist for ${project.name}`}>
            <div>
              <strong>{project.name}</strong>
              <span>{project.phase} · {countLabel(count, "activity", "activities")} awaiting approval</span>
            </div>
            <div className={`checklist-approval-due${due !== undefined && due <= now ? " overdue" : ""}`}>
              {due !== undefined ? <>
                <strong>{due <= now ? "Overdue for review" : "Review due"}</strong>
                <time dateTime={new Date(due).toISOString()}>{new Date(due).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time>
              </> : <span>Submission date unavailable</span>}
            </div>
            <Icon name="arrow" size={18} />
          </button>
        ))}
      </div>
      {reviews.length > 3 && <p className="checklist-approval-more">{countLabel(reviews.length - 3, "more project")} awaiting review. Open Review approvals to see all.</p>}
    </section>
  )
}

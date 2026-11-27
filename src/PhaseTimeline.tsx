import { Icon } from "./ui"
import { phaseTimeline } from "./client-access"

export default function PhaseTimeline({
  phase,
  phases,
  completed = false,
  detailed = false,
  compact = false,
  summarizeUpcoming = false,
}: {
  phase: string
  phases?: string[]
  completed?: boolean
  detailed?: boolean
  compact?: boolean
  summarizeUpcoming?: boolean
}) {
  return (
    <ol
      className={`construction-phase-timeline ${detailed ? "detailed" : ""} ${compact ? "compact" : ""}`}
      aria-label="Read-only construction phase timeline"
    >
      {phaseTimeline(phase, completed, phases).map((item, index) => (
        <li key={item.name} className={item.state} aria-current={item.state === "current" ? "step" : undefined}>
          <span aria-hidden={compact || undefined}>
            {item.state === "completed" ? (
              <Icon name="check" size={compact ? 12 : 17} />
            ) : compact ? null : item.state === "current" ? (
              index + 1
            ) : (
              <Icon name="shield" size={16} />
            )}
          </span>
          <div>
            <strong>{item.name}</strong>
            {!(summarizeUpcoming && item.state !== "completed" && item.state !== "current") && <small>
              {item.state === "completed"
                ? "Completed"
                : item.state === "current"
                  ? "Current construction phase"
                  : summarizeUpcoming ? "Upcoming" : "Starts after prior sign-off"}
            </small>}
          </div>
        </li>
      ))}
    </ol>
  )
}

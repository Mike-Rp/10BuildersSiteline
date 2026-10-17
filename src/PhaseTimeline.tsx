import { Icon } from "./ui"
import { phaseTimeline } from "./client-access"

export default function PhaseTimeline({
  phase,
  phases,
  completed = false,
  detailed = false,
}: {
  phase: string
  phases?: string[]
  completed?: boolean
  detailed?: boolean
}) {
  return (
    <ol
      className={`construction-phase-timeline ${detailed ? "detailed" : ""}`}
      aria-label="Read-only construction phase timeline"
    >
      {phaseTimeline(phase, completed, phases).map((item, index) => (
        <li key={item.name} className={item.state}>
          <span>
            {item.state === "completed" ? (
              <Icon name="check" size={17} />
            ) : item.state === "current" ? (
              index + 1
            ) : (
              <Icon name="shield" size={16} />
            )}
          </span>
          <div>
            <strong>{item.name}</strong>
            <small>
              {item.state === "completed"
                ? "Completed"
                : item.state === "current"
                  ? "Current construction phase"
                  : "Starts after prior sign-off"}
            </small>
          </div>
        </li>
      ))}
    </ol>
  )
}

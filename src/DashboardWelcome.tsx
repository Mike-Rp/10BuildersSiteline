import type { LoginGreeting } from "./dashboard-greeting"

export default function DashboardWelcome({ greeting }: { greeting?: LoginGreeting }) {
  if (!greeting) return null
  return (
    <p className="dashboard-welcome">
      {greeting.message}
    </p>
  )
}

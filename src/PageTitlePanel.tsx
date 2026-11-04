import type { ReactNode } from "react"
import "./page-title-panel.css"

export default function PageTitlePanel({ title, children }: {
  title: string
  children?: ReactNode
}) {
  return <header className="page-heading page-title-panel">
    <div className="page-title-copy">
      <h1>{title}</h1>
    </div>
    {children && <div className="page-title-actions">{children}</div>}
  </header>
}

import type { ReactNode } from "react"
import "./page-title-panel.css"

export default function PageTitlePanel({ title, eyebrow, children }: {
  title: string
  eyebrow?: string
  children?: ReactNode
}) {
  return <header className="page-heading page-title-panel">
    <div className="page-title-copy">
      {eyebrow && <div className="page-title-eyebrow">{eyebrow}</div>}
      <h1>{title}</h1>
    </div>
    {children && <div className="page-title-actions">{children}</div>}
  </header>
}

import { useState } from "react"
import MonthlyReport from "./MonthlyReport"
import { Button, Empty, Icon } from "./ui"
import "./reports.css"

// The caller supplies its existing authorized project projection. Report reads
// and exports independently enforce project and role permissions on the server.
export default function Reports({ projects }: { projects: { id: string; name: string }[] }) {
  const [projectId, setProjectId] = useState(projects[0]?.id || "")
  const [open, setOpen] = useState(false)
  const selected = projects.some(p => p.id === projectId) ? projectId : projects[0]?.id || ""
  return <>
    <div className="page-heading"><div><h1>Reports</h1><p>Preview and export monthly construction progress for your authorized projects.</p></div></div>
    {!projects.length ? <Empty title="No projects available">Reports will appear when you have access to a project.</Empty> : <>
      <section className="report-launcher" aria-label="Monthly construction report">
        <div className="section-title"><h2><Icon name="doc" /> Monthly Project Progress Summary</h2><span>MONTHLY</span></div>
        <p>Verified construction progress, checklist approvals, completed phases, rework, and pending reviews in one report.</p>
        <label className="report-project">Project<select value={selected} onChange={e => setProjectId(e.target.value)}>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <div className="role-actions"><Button variant="primary" icon="doc" onClick={() => setOpen(true)}>Preview & export report</Button></div>
        <p>Choose a month in the preview, then export CSV or print / save as PDF.</p>
      </section>
      <section aria-label="Report coverage">
        <h2>What this report covers</h2>
        <div className="report-coverage">
          {[
            ["Construction progress", "Opening and closing verified progress, with earned checklist credit and scope changes."],
            ["Checklist approvals", "Approval events and distinct approved activities during the selected month."],
            ["Phase completion", "Phases reaching verified completion, including whether they remain complete at the cutoff."],
            ["Rework", "Confirmed rework and previously approved credit withdrawn for corrections."],
            ["Pending reviews", "Evidence, progress reports, and rework requests pending at the reporting cutoff."],
            ["Reporting scope", "Available metrics follow your role and project access. Missing historical records are shown as unavailable."],
          ].map(([title, text]) => <article key={title}><h3>{title}</h3><p>{text}</p></article>)}
        </div>
      </section>
    </>}
    {open && selected && <MonthlyReport projects={projects} initialProjectId={selected} onClose={() => setOpen(false)} />}
  </>
}

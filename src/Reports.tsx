import { useState } from "react"
import MonthlyReport from "./MonthlyReport"
import ReportProjectSearch from "./ReportProjectSearch"
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
        <ReportProjectSearch projects={projects} value={selected} onChange={setProjectId} />
        <div className="role-actions"><Button variant="primary" icon="doc" onClick={() => setOpen(true)}>Preview & export report</Button></div>
        <p>Choose a month in the preview, then export CSV or print / save as PDF.</p>
      </section>
      <aside className="report-guidance" aria-label="Report guidance">
        <p><strong>About this report:</strong> Monthly verified progress, checklist approvals, completed phases, confirmed rework, and pending reviews at the reporting cutoff.</p>
        <p>Information follows your role and project access. Missing historical records appear as unavailable.</p>
      </aside>
    </>}
    {open && selected && <MonthlyReport projects={projects} initialProjectId={selected} onClose={() => setOpen(false)} />}
  </>
}

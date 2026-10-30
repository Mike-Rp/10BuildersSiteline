import React, { useState } from "react"
import { createRoot } from "react-dom/client"
import { IntakeForm, CompanyForm } from "../src/panels"
import CompanyCapabilities from "../src/CompanyCapabilities"
import TradeAllocationPanel from "../src/TradeAllocationPanel"
import { activeFixture, currentProject } from "../tests/fixtures.mjs"
import { DISCIPLINES } from "../src/model"
import { setApiBase } from "../src/api/client"

// This separate, local preview uses example records and cannot call the live API.
setApiBase("http://127.0.0.1:8443/__preview-only-api")
const demo = activeFixture()
demo.accounts = demo.accounts.map(account => ({ ...account, expiry: "2099-01-01" }))
const project = currentProject(demo)
project.status = "pending"
project.workflow.activation = undefined
project.workflow.selections = []
project.subcontractorAllocationVersion = 1
delete project.subcontractorAllocation
delete project.siteLocation
for (const company of demo.companies) {
  company.status = "approved"
  company.activeProjectIds = []
  company.commitmentCount = 0
  company.capabilityReview = { disciplines: DISCIPLINES, reviewedAt: "2026-10-28T02:00:00Z", reviewedBy: "Example Site PM", reviewedById: "a4", unavailable: false, note: "Reviewed the supporting company trade records.", documentIds: ["preview-proof"] }
  company.documents = [{ id: "preview-proof", name: "Example company records.pdf", uploaded: true }]
}
const views = ["Subcontractor registration", "Project intake", "Capability review", "Allocation"]
const pages = ["__location-removal-preview.html", "__project-intake-without-location-preview.html", "__capability-review-without-location-preview.html", "__allocation-without-location-preview.html"]

export default function LocationRemovalPreview({ initialView = views[0] }: { initialView?: string }) {
  const [view, setView] = useState(initialView)
  const [notice, setNotice] = useState("")
  const actor = demo.accounts.find(account => account.id === "a4")!
  const showNotice = () => setNotice("This is a visual preview using example data. No live records were saved.")
  return <div className="location-removal-preview">
    <header className="preview-brand"><strong>Siteline</strong><span>10 BUILDERS</span></header>
    <main className="preview-content">
      <div className="page-heading"><div><h1>Updated forms</h1><p>Visual preview of actual components · Example data · No live records are saved</p></div></div>
      <div className="preview-tabs" role="tablist" aria-label="Preview screen">
        {views.map((label,index) => <a href={`/${pages[index]}`} role="tab" aria-selected={view === label} key={label}>{label}</a>)}
      </div>
      {notice && <p className="notice" role="status">{notice}</p>}
      <section className="preview-card" role="tabpanel" aria-label={view}>
        <h2 className="preview-title">{view}</h2>
        {view === views[0] && <CompanyForm owner="Example Site PM" actorId="a4" role="spm" status="pending" disciplines={DISCIPLINES} onSave={() => { showNotice(); return false }} onClose={showNotice} />}
        {view === views[1] && <IntakeForm state={{ ...demo, projects: [] }} onSubmit={showNotice} onClient={account => account} onClose={showNotice} />}
        {view === views[2] && <CompanyCapabilities company={demo.companies[0]} disciplines={DISCIPLINES} role="spm" onSave={async () => showNotice()} />}
        {view === views[3] && <TradeAllocationPanel state={demo} project={project} actor={actor} onAction={async () => { showNotice(); return false }} onNewCompany={() => setView(views[0])} onPreview={showNotice} onActivated={showNotice} onOpenActive={showNotice} />}
      </section>
    </main>
  </div>
}

if (typeof document !== "undefined") createRoot(document.getElementById("root")!).render(<LocationRemovalPreview />)

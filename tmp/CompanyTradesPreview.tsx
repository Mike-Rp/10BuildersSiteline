import React from "react"
import CompanyCapabilities from "../src/CompanyCapabilities"
import { TradeAllocationOverview } from "../src/TradeAllocationPanel"
import { companyTradePhases } from "../Thesis-Backend/src/domain/company-trades.js"
import { recommendTeam } from "../Thesis-Backend/src/domain/subcontractor-allocation.js"
import { phaseDefinitions } from "../src/model"
import { activeFixture, currentProject } from "../tests/fixtures.mjs"

const state = activeFixture()
const project = currentProject(state)
project.type = "Commercial"
project.name = "Example Commercial Project"
project.status = "pending"
project.workflow.selections = []
const samples = [
  { id: "sample-builder", name: "Example Civil & Finishes Co.", disciplines: ["Civil", "Structural", "Interior/Finishes"] },
  { id: "sample-services", name: "Example Building Services Co.", disciplines: ["Electrical", "Plumbing", "Mechanical", "Fire Protection"] },
  { id: "sample-envelope", name: "Example Enclosure Co.", disciplines: ["Facade", "Waterproofing"] },
]
state.companies = samples.map(sample => ({
  ...state.companies[0], id: sample.id, name: sample.name, primaryTrade: "Enclosure works", status: "approved", activeProjectIds: [], commitmentCount: 0,
  documents: [{ id: "sample-proof", name: "Example company capability records.pdf", uploaded: true }],
  capabilityReview: { disciplines: sample.disciplines, unavailable: false, documentIds: ["sample-proof"], note: "Facade installation and waterproofing services verified against the submitted company records.", reviewedAt: "2026-10-28T08:00:00Z", reviewedBy: "Example Site PM", reviewedById: "sample-reviewer" },
}))
const requirements = companyTradePhases(project.type, phaseDefinitions(project.type))
const plan = recommendTeam(project.type, requirements, samples.map(company => ({ ...company, status: "approved", reviewed: true, unavailable: false, commitments: 0, declined: false })))!
project.subcontractorAllocation = { ...plan, version: 1, revision: 1, requirements }

export default function CompanyTradesPreview({ view = "company" }: { view?: string }) {
  return <>
    <header className="sample-brand"><strong>Siteline</strong><span>10 BUILDERS</span><span className="sample-badge">EXAMPLE DATA</span></header>
    <main className="sample-main">
      <div className="sample-heading"><h1>Company trades & phase allocation</h1><p>Example of the implemented company form and allocation view.</p></div>
      <nav className="sample-nav"><a href="/__company-trades-preview.html" aria-current={view === "company" ? "page" : undefined}>Company trades</a><a href="/__company-trade-allocation-preview.html" aria-current={view === "allocation" ? "page" : undefined}>Phase allocation</a></nav>
      {view === "company" ? <>
        <div className="sample-company-heading"><div><h2>Example Enclosure Co.</h2><p>Subcon directory · Company capabilities</p></div><span className="sample-approved">Approved company</span></div>
        <div className="sample-panel"><CompanyCapabilities company={state.companies[2]} role="spm" onSave={async () => {}} /></div>
        <aside className="sample-connection"><strong>How these trades connect</strong><p>Facade + Waterproofing → Commercial → Envelope / Curtain Wall</p><p>The company covers these two trades. The complete project team also includes civil, finishes and building-services partners.</p><a href="/__company-trade-allocation-preview.html">View the example allocation →</a></aside>
      </> : <>
        <div className="sample-company-heading"><div><h2>{project.name}</h2><p>Commercial · Recommended company team · Example allocation</p></div></div>
        <div className="sample-panel"><TradeAllocationOverview state={state} project={project} /></div>
      </>}
    </main>
  </>
}

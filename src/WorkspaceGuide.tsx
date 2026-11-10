import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Button, Icon, Modal } from "./ui"
import "./workspace-guide.css"

type Role = "admin" | "opm" | "spm" | "client"
type Step = { title: string; detail: string; page: string }
type Topic = { title: string; description: string; steps: Step[] }
const step = (title: string, detail: string, page: string): Step => ({ title, detail, page })
const labels: Record<Role, string> = { admin: "Administrator", opm: "Office PM", spm: "Site PM", client: "Client" }

export function guideTopics(role: Role): Topic[] {
  const sites = step("Find your projects", "Open Active sites and select a project to view its current status and available actions. Only projects you can access appear here.", "Active sites")
  const records = step("Find reports and records", "Open a project to find the documents and reports available to your role. Check the selected project before downloading records.", "Active sites")
  const settings = step("Manage your preferences", "Review your notification and account preferences. Changes to your account should be made from your own workspace.", role === "admin" ? "Settings" : "Preferences")
  const intake = [
    step("Start a project intake", "Select New project intake to enter the project details. Opening the form does not submit a project.", "Project intake"),
    step("Review project details", "Enter the project type, dates, floor area, floors, and client. Check the information before generating allocation.", "Project intake"),
    step("Review staffing and agreements", "Check the proposed personnel, eligibility, and required signed agreements. Resolve missing requirements before handing off the intake.", "Project intake"),
  ]
  const field = [
    sites,
    step("Open your phase workspace", "Select your assigned project and open My phase workspace. Confirm the phase and your assignment before adding evidence. Upcoming or completed phases may be read-only.", "Active sites"),
    step("Add and submit evidence", "Choose the relevant checklist activity, add attachments and a clear note, then review your submission. This guide never uploads or submits evidence for you.", "Active sites"),
    step("Check feedback", "Return to the activity to check its review status. If corrections are requested, read the review note and submit corrected evidence. Submitted evidence is not automatically approved.", "Active sites"),
  ]
  const review = [sites,
    step("Review submitted evidence", "Open the project's pending submissions. Check the activity, submitting SPM, evidence, and notes before choosing a review action.", "Active sites"),
    step("Record your decision", "Approve only after checking the requirement, or return the submission with a clear correction note. Review decisions are real actions and are never performed by this guide.", "Active sites"),
    step("Review phase handoff", "Check the project's completion and handoff requirements. Outstanding evidence or responsibilities can prevent the next phase from opening.", "Active sites"),
  ]
  const topic = (title: string, description: string, steps: Step[]): Topic => ({ title, description, steps })
  if (role === "admin") return [
    topic("Quick workspace overview", "Find your main tools and next actions", [step("Your dashboard", "Review priority items and follow-up actions. Use the sidebar to move between project intake, active sites, records, and organization tools.", "Dashboard"), sites, step("Find people and records", "Use Directory for engineers and subcontractors, Documents for records, and Team for account administration.", "Directory"), settings]),
    topic("Create a project intake", "Enter details, review staffing, and prepare handoff", intake),
    topic("Review personnel allocation", "Check eligibility, coverage, and agreements", [intake[2]]),
    topic("Monitor an active project", "Find project status and pending work", [sites, records]),
    topic("Manage accounts and resources", "Find people and project records", [step("Manage team accounts", "Find the account in Team and check its role and status before making changes.", "Team"), step("Browse resources", "Use Directory to find engineer and subcontractor records. Open Documents for saved project and engineer documents.", "Directory")]),
    topic("Find reports and records", "Locate project documents and history", [records, step("Browse saved documents", "Filter documents and open the relevant record. Check the project and document details before downloading.", "Documents")]),
  ]
  if (role === "spm") return [topic("Quick workspace overview", "Find projects, evidence, and feedback", [step("Your dashboard", "Check your pending work and assignment notices. Use Active sites to open your assigned projects.", "Dashboard"), ...field, settings]), topic("Submit activity evidence", "Open your phase workspace and prepare a submission", field), topic("Respond to review feedback", "Find corrections and check approval status", [field[0], field[3]]), topic("Find resources and reports", "Locate available documents and project history", [step("Browse resources", "Open Resources for documents and subcontractor information available to your assignment.", "Resources"), records])]
  if (role === "opm") return [topic("Quick workspace overview", "Find assignments, reviews, and project records", [step("Review your queue", "Check the Confirmation queue for assignments and intake items awaiting your response. Read the project details before accepting or returning an item.", "Confirmation queue"), ...review, settings]), topic("Review assignments", "Check intake details and respond", [step("Open the confirmation queue", "Select an intake and review the team, project information, and agreements before responding.", "Confirmation queue")]), topic("Review evidence and phase handoff", "Check submissions and record review decisions", review), topic("Find documents and reports", "Locate records available to your role", [step("Browse documents", "Open Documents and select the relevant project record.", "Documents"), records])]
  return [topic("Quick workspace overview", "Find your projects and published updates", [sites, step("View your project overview", "Select a project to see the information published for you. Internal submissions awaiting review may not appear here.", "Project Overview"), records, settings]), topic("View progress and photos", "Find released project updates", [step("View progress history", "Select your project and review the published progress entries.", "Progress History"), step("View site photographs", "Browse the site photos released for your project.", "Site Photographs")]), topic("Find shared documents", "Open available project records", [step("Open project documents", "Select your project and open a shared document to preview or download it.", "Project Documents")])]
}

export default function WorkspaceGuide({ actor, onNavigate, enabled = true }: {
  actor: { id: string; name: string; role: Role }; onNavigate: (page: string) => void; enabled?: boolean
}) {
  const key = `10buildline:workspace-guide:v1:${actor.id}:${actor.role}`
  const [view, setView] = useState<"welcome" | "topics" | "tour" | null>(null)
  const [topicIndex, setTopicIndex] = useState(0)
  const [index, setIndex] = useState(0)
  const topics = guideTopics(actor.role)
  const topic = topics[topicIndex]
  const current = topic.steps[index]
  useEffect(() => {
    if (!enabled) { setView(null); return }
    try { if (!localStorage.getItem(key)) setView("welcome") } catch { setView("welcome") }
  }, [key, enabled])
  function remember() { try { localStorage.setItem(key, "seen") } catch { /* Guide remains usable without storage. */ } }
  function close() { remember(); setView(null) }
  function start(which: number) { remember(); setTopicIndex(which); setIndex(0); setView("tour") }
  return <>
    <button type="button" className="workspace-guide-trigger" disabled={!enabled} onClick={() => { remember(); setView("topics") }}><Icon name="doc" size={18} />Workspace guide<Icon name="arrow" size={15} /></button>
    {enabled && view && createPortal(<Modal title={view === "welcome" ? `Welcome to your workspace, ${actor.name.split(" ")[0]}` : view === "topics" ? "Workspace guide" : topic.title} subtitle={view === "welcome" ? `First visit · ${labels[actor.role]}` : labels[actor.role]} onClose={close}>
      <div className="workspace-guide-content">
        {view === "welcome" && <>
          <p>Get familiar with your tools, or jump straight into your work.</p>
          <h3>Your quick tour covers</h3>
          <ul>{topics[0].steps.map((s, i) => <li key={`${s.title}-${i}`}><Icon name="check" size={18} /><span>{s.title}</span></li>)}</ul>
          <p className="workspace-guide-note">A short introduction · You can exit anytime</p>
          <Button variant="primary" onClick={() => start(0)}>Start quick tour</Button>
          <Button onClick={() => { remember(); setView("topics") }}>Choose a guide topic</Button>
          <Button onClick={close}>Skip for now</Button>
          <p className="workspace-guide-note">Restart the tour anytime from Workspace guide.</p>
        </>}
        {view === "topics" && <><p>What would you like help with?</p><div className="workspace-guide-topics">{topics.map((t, i) => <button type="button" key={t.title} onClick={() => start(i)}><span><strong>{t.title}</strong><small>{t.description}</small></span><Icon name="chevron" size={18} /></button>)}</div><Button onClick={close}>Close guide</Button></>}
        {view === "tour" && <>
          <p className="workspace-guide-note" aria-live="polite">Step {index + 1} of {topic.steps.length}</p>
          <progress aria-label="Walkthrough progress" value={index + 1} max={topic.steps.length} />
          <h3 tabIndex={-1}>{current.title}</h3><p>{current.detail}</p>
          <Button onClick={() => { onNavigate(current.page); close() }}>Open {current.page}</Button>
          <p className="workspace-guide-note">Opening a page ends this guide. Reopen Workspace guide whenever you need help. No submissions or approvals are performed.</p>
          <div className="workspace-guide-controls"><Button onClick={() => setView("topics")}>All guide topics</Button><Button onClick={close}>Exit tour</Button><Button disabled={index === 0} onClick={() => setIndex(index - 1)}>Back</Button><Button variant="primary" onClick={() => index + 1 === topic.steps.length ? close() : setIndex(index + 1)}>{index + 1 === topic.steps.length ? "Finish" : "Next"}</Button></div>
        </>}
      </div>
    </Modal>, document.body)}
  </>
}

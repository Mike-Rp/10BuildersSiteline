import { useState } from "react"
import { Badge, Button, Empty, Field, Icon, Modal } from "./ui"
import { Upload } from "./panels"
import { AgreementPreviewModal } from "./ClientSubconReview"
import {
  eligibleCandidates,
  featuredCandidate,
  recommendationReason,
} from "./featuredCompany"
import {
  dateLabel,
  DOC_LABELS,
  initials,
  type Account,
  type Doc,
  type Project,
  type State,
} from "./model"
import {
  activationChecks,
  allocationReady,
  clientSubconAgreement,
  clientSubconReview,
  openClientSubconIssue,
  leadId,
  projectSubcontractor,
  subcontractorRecommendation,
  subcontractorRecommendations,
  workflowFor,
  type WorkflowCommand,
} from "./workflows"

type Recommendation = ReturnType<typeof subcontractorRecommendation>
function CompanyAvailability({ candidate }: { candidate: Recommendation }) {
  return (
    <div className="subcon-availability">
      {candidate.committed || candidate.company.availability === "committed" ? (
        <Badge tone="amber">
          {candidate.company.committedUntil
            ? `Committed through ${dateLabel(candidate.company.committedUntil)}`
            : "Committed to another project"}
        </Badge>
      ) : (
        <Badge tone={candidate.availableManpower > 0 ? "green" : "amber"}>
          {candidate.availableManpower > 0
            ? `${candidate.availableManpower} manpower available`
            : "Availability needs confirmation"}
        </Badge>
      )}
      <small>
        {candidate.otherProjects} other active project
        {candidate.otherProjects === 1 ? "" : "s"} ·{" "}
        {candidate.company.manpowerDocuments.length} manpower list document
        {candidate.company.manpowerDocuments.length === 1 ? "" : "s"}
      </small>
    </div>
  )
}
/** Office PM view of the allocation. Read-only by design: it renders no actions. */
export function SubcontractorAllocationReadOnly({
  state,
  project,
}: {
  state: State
  project: Project
}) {
  const work = workflowFor(project)
  const lead = state.accounts.find((a) => a.id === leadId(project))
  const current = projectSubcontractor(project)
  const company = current
    ? state.companies.find((c) => c.id === current.companyId)
    : undefined
  const log = current?.contactLog || (current?.contactAt ? [current.contactAt] : [])
  const declined = work.selections.filter((s) => s.status === "declined")
  const nameOf = (id: string) =>
    state.companies.find((c) => c.id === id)?.name || "Company record unavailable"
  return (
    <div className="role-card-content">
      <div className="notice">
        <Icon name="shield" />
        <p>
          Read-only. Only the Lead Site PM{lead ? `, ${lead.name},` : ""} decides
          subcontractor allocation. Office PM approval is not part of this step.
        </p>
      </div>
      {project.clientSubcon ? (
        <p>
          Client-provided subcontractor: <strong>{project.clientSubcon}</strong>
          {project.clientSubconReview?.acknowledgedAt
            ? " · acknowledged by the Lead Site PM"
            : " · awaiting the Lead Site PM’s review"}
        </p>
      ) : !current ? (
        <p>
          {allocationReady(project)
            ? "No subcontractor has been contacted yet."
            : "Allocation is locked until all required Site PMs have accepted."}
        </p>
      ) : (
        <article className="subcon-team-card">
          <div className="section-title">
            <Badge tone={current.status === "accepted" ? "green" : "amber"}>
              {current.status === "accepted"
                ? "Accepted · locked"
                : "Awaiting response"}
            </Badge>
          </div>
          <h3>{company?.name || "Company record unavailable"}</h3>
          <p>
            {company?.contact || "No contact person on file"} ·{" "}
            {company?.phone || "No phone on file"}
          </p>
          {company && (
            <CompanyAvailability
              candidate={subcontractorRecommendation(state, project, company)}
            />
          )}
          <h4>Contact log</h4>
          {log.length === 0 ? (
            <p className="role-muted">No contact attempts recorded.</p>
          ) : (
            <ol className="plain-list">
              {log.map((at, index) => (
                <li key={`${at}-${index}`}>
                  Attempt {index + 1} · {new Date(at).toLocaleString()}
                </li>
              ))}
            </ol>
          )}
          {current.responseAt && (
            <p>
              Decision recorded · {new Date(current.responseAt).toLocaleString()}
            </p>
          )}
        </article>
      )}
      {declined.length > 0 && (
        <section className="subcon-history">
          <h3>Declined for this project</h3>
          {declined.map((s) => (
            <p key={s.companyId}>
              {nameOf(s.companyId)}
              {s.responseAt && ` · ${new Date(s.responseAt).toLocaleString()}`}
            </p>
          ))}
        </section>
      )}
    </div>
  )
}
export default function LeadSubcontractorPanel({
  state,
  project,
  actor,
  onAction,
  onCrew,
  onNewCompany,
  onPreview,
  onActivated,
  onOpenActive,
}: {
  state: State
  project: Project
  actor: Account
  onAction: (command: WorkflowCommand, message?: string) => boolean
  onCrew: (companyId: string) => void
  onNewCompany: () => void
  onPreview: (doc: Doc) => void
  onActivated: () => void
  onOpenActive: () => void
}) {
  const [availability, setAvailability] = useState("all")
  const [agreementOpen, setAgreementOpen] = useState(false)
  const [confirmActivation, setConfirmActivation] = useState(false)
  const [activationError, setActivationError] = useState("")
  const [activatedNow, setActivatedNow] = useState(false)
  const work = workflowFor(project)
  // One subcontractor per project: the company contacted (awaiting reply) or accepted.
  const current = projectSubcontractor(project)
  const currentCompany = current
    ? state.companies.find((company) => company.id === current.companyId)
    : undefined
  const confirmed = current?.status === "accepted"
  const contactLog =
    current?.contactLog || (current?.contactAt ? [current.contactAt] : [])
  const declinedIds = new Set(
    work.selections
      .filter((selection) => selection.status === "declined")
      .map((selection) => selection.companyId),
  )
  const checks = activationChecks(state, project)
  const clientOwned = !!project.clientSubcon
  const review = clientSubconReview(project)
  const openIssue = openClientSubconIssue(project)
  const clientAgreement = clientSubconAgreement(project)
  const responsesComplete = checks.find(
    (check) => check.id === "subcontractors",
  )!.passed
  const active = project.status === "active"
  const recommendations = subcontractorRecommendations(state, project)
  const candidates = recommendations.filter(
    (candidate) => candidate.company.id !== current?.companyId,
  )
  const recommendedId = candidates.find(
    (candidate) => !declinedIds.has(candidate.company.id),
  )?.company.id
  // Before any contact: the system's top eligible pick is featured; the rest are alternatives.
  const eligible = eligibleCandidates(state, project)
  const featured = featuredCandidate(state, project)
  const otherCandidates = candidates
    .filter((candidate) => candidate.company.id !== featured?.company.id)
    .filter(
      (candidate) =>
        availability === "all" ||
        (availability === "uncommitted"
          ? !candidate.committed
          : candidate.committed),
    )
  const filteredCandidates = candidates.filter(
    (candidate) =>
      availability === "all" ||
      (availability === "uncommitted"
        ? !candidate.committed
        : candidate.committed),
  )
  const agreement = project.docs.find(
    (doc) => doc.label === DOC_LABELS[6] && doc.uploaded,
  )
  const client = state.accounts.find(
    (account) => account.id === project.clientId && account.role === "client",
  )
  const clientReady = checks.find((check) => check.id === "client")!.passed
  const history = work.selections.filter(
    (selection) =>
      selection.status === "declined" ||
      selection.status === "replaced" ||
      selection.status === "archived",
  )
  if (
    actor.role !== "spm" ||
    actor.id !== leadId(project) ||
    !allocationReady(project)
  ) {
    return (
      <div className="allocation-locked">
        <Icon name="shield" />
        <div>
          <h3>Subcontractor coordination is locked</h3>
          <p>
            Only the project Lead can coordinate the team after all six
            documents and every required Site PM acceptance.
          </p>
        </div>
      </div>
    )
  }
  function command(action: WorkflowCommand, message: string) {
    return onAction({ ...action, projectId: project.id }, message)
  }
  function availabilityDetails(candidate: Recommendation) {
    return <CompanyAvailability candidate={candidate} />
  }
  return (
    <section className="lead-subcontractor-panel">
      <div className="lead-coordination-heading">
        <div>
          <span className="eyebrow">PROJECT TEAM COORDINATION</span>
          <h2>
            {clientOwned
              ? "Client-provided subcontractor"
              : "Subcontractor allocation"}
          </h2>
          <p>
            {clientOwned
              ? "Admin assigned this company with the client. Review its details and agreement, then acknowledge."
              : "Build the right team. Review the fit, record the conversation, confirm the commitment."}
          </p>
        </div>
        <div className="lead-owner">
          <span className="avatar">{initials(actor.name)}</span>
          <span>
            <strong>{actor.name}</strong>
            <small>Project Lead Site PM</small>
          </span>
          <Badge tone="green">Unlocked</Badge>
        </div>
      </div>
      <ol className="subcon-workflow-steps">
        {(clientOwned
          ? [
              {
                label: "Review assigned subcontractor",
                complete: !!review.acknowledgedAt,
              },
              { label: "Sign & activate", complete: active },
            ]
          : [
              { label: "Contact a subcontractor", complete: !!current },
              { label: "Record their decision", complete: responsesComplete },
              { label: "Sign & activate", complete: active },
            ]
        ).map((step, index) => (
          <li key={step.label} className={step.complete ? "done" : "pending"}>
            <span>
              {step.complete ? <Icon name="check" size={16} /> : index + 1}
            </span>
            <strong>{step.label}</strong>
          </li>
        ))}
      </ol>
      {!clientOwned && (
        <div className="subcon-summary">
          <div>
            <span>Subcontractor contacted</span>
            <strong>{current ? "01" : "00"}</strong>
          </div>
          <div>
            <span>Accepted & locked</span>
            <strong>{confirmed ? "01" : "00"}</strong>
          </div>
          <div>
            <span>Awaiting a decision</span>
            <strong>{current && !confirmed ? "01" : "00"}</strong>
          </div>
        </div>
      )}
      {project.clientSubcon && (
        <section className="client-subcon-card">
          <div className="section-title">
            <span className="company-monogram">
              {initials(project.clientSubcon)}
            </span>
            <Badge
              tone={
                review.acknowledgedAt ? "green" : openIssue ? "red" : "amber"
              }
            >
              {review.acknowledgedAt
                ? "Assignment Acknowledged — Locked"
                : openIssue
                  ? "Acknowledgment on hold"
                  : "Awaiting your review"}
            </Badge>
          </div>
          <h3>{project.clientSubcon}</h3>
          <p className="wrap-anywhere">
            {project.clientSubconEmail || "No email on file"} · Assigned by
            Administrator
          </p>
          {review.acknowledgedAt && (
            <p>
              Reviewed by <strong>{review.acknowledgedBy}</strong> on{" "}
              {new Date(review.acknowledgedAt).toLocaleString("en-PH", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
              . Review only, not subcontractor acceptance.
            </p>
          )}
          {openIssue && (
            <div className="role-error">
              <Icon name="clock" />
              <span>Issue sent to Admin. Waiting for resolution.</span>
            </div>
          )}
          <div className="subcon-contact-actions">
            <Button
              variant="primary"
              icon="doc"
              disabled={!clientAgreement}
              onClick={() => setAgreementOpen(true)}
            >
              View Agreement
            </Button>
            {!clientAgreement && (
              <small className="role-muted">
                Agreement missing. Ask Admin to correct the record.
              </small>
            )}
          </div>
          <small className="role-muted">
            The company and agreement are locked. You cannot edit, replace or
            archive them.
          </small>
        </section>
      )}
      {!clientOwned && (
        <>
          {!confirmed && !active && (current || featured) && (
            <div className="section-title">
              <p className="role-muted">
                The system ranks verified companies. Contact one; you record
                its answer yourself. Nothing is emailed or called.
              </p>
              <Button icon="plus" onClick={onNewCompany}>
                Propose new company
              </Button>
            </div>
          )}
          {current && currentCompany && (
            <section className="subcon-selected-section">
              <div className="section-title">
                <h3>Project subcontractor</h3>
              </div>
              <article
                className={`subcon-team-card ${confirmed ? "is-accepted" : ""}`}
              >
                <div className="section-title">
                  <span className="company-monogram">
                    {initials(currentCompany.name)}
                  </span>
                  <Badge tone={confirmed ? "green" : "amber"}>
                    {confirmed ? "Accepted · locked" : "Awaiting response"}
                  </Badge>
                </div>
                <h3>{currentCompany.name}</h3>
                <p>
                  {currentCompany.contact || "No contact person on file"} ·{" "}
                  {currentCompany.phone || "No phone on file"}
                </p>
                {availabilityDetails(
                  subcontractorRecommendation(state, project, currentCompany),
                )}
                {confirmed ? (
                  <div className="subcon-acceptance-lock">
                    <Icon name="shield" />
                    <div>
                      <strong>
                        Locked · Subcontractor confirmed: {currentCompany.name}
                      </strong>
                      <p>
                        No contact, replacement or new selection is possible for
                        this project. Next: upload the signed Site PM–
                        Subcontractor Agreement below.
                      </p>
                    </div>
                  </div>
                ) : (
                  !active && (
                    <>
                      <div className="subcon-contact-actions">
                        <Button
                          icon="clock"
                          onClick={() =>
                            command(
                              {
                                type: "contact_company",
                                companyId: currentCompany.id,
                              },
                              "Another contact attempt recorded. No email was sent.",
                            )
                          }
                        >
                          Log another attempt
                        </Button>
                      </div>
                      <div className="subcon-contact-actions">
                        <strong>Record response</strong>
                        <div className="subcon-decision-buttons">
                          <Button
                            variant="primary"
                            icon="check"
                            onClick={() =>
                              command(
                                {
                                  type: "respond_company",
                                  companyId: currentCompany.id,
                                  accepted: true,
                                },
                                "Acceptance recorded. This subcontractor is now locked.",
                              )
                            }
                          >
                            Accepted
                          </Button>
                          <Button
                            variant="danger-ghost"
                            onClick={() =>
                              command(
                                {
                                  type: "respond_company",
                                  companyId: currentCompany.id,
                                  accepted: false,
                                },
                                "Decline recorded. You can now contact another company.",
                              )
                            }
                          >
                            Declined
                          </Button>
                        </div>
                      </div>
                    </>
                  )
                )}
                <h4>Contact log</h4>
                {contactLog.length === 0 ? (
                  <p className="role-muted">No contact attempts recorded.</p>
                ) : (
                  <ol className="plain-list">
                    {contactLog.map((at, index) => (
                      <li key={`${at}-${index}`}>
                        Attempt {index + 1} · {new Date(at).toLocaleString()}
                      </li>
                    ))}
                  </ol>
                )}
                {current.responseAt && (
                  <p>
                    Decision recorded ·{" "}
                    {new Date(current.responseAt).toLocaleString()}
                  </p>
                )}
                <div className="subcon-card-footer">
                  <Button
                    variant="text-button"
                    onClick={() => onCrew(currentCompany.id)}
                  >
                    View company details
                    <Icon name="arrow" size={16} />
                  </Button>
                </div>
              </article>
            </section>
          )}
          {!confirmed && !active && !current && featured && (
            <section className="subcon-recommendation-section">
              <div className="section-title">
                <div>
                  <h3>Recommended subcontractor</h3>
                  <p className="role-muted subsection">
                    The system’s top pick. It is only a suggestion: nothing is
                    recorded until you contact the company.
                  </p>
                </div>
              </div>
              <article className="subcon-candidate-card subcon-featured-card">
                <div className="section-title">
                  <span className="company-monogram">
                    {initials(featured.company.name)}
                  </span>
                  <Badge tone="green">Recommended</Badge>
                </div>
                <h3>{featured.company.name}</h3>
                <p>
                  {featured.company.contact || "No contact person on file"} ·{" "}
                  {featured.company.phone || "No phone on file"}
                </p>
                <Badge tone={featured.committed ? "amber" : "green"}>
                  {featured.committed
                    ? "Conflicting commitment"
                    : "No conflicting commitment"}
                </Badge>
                {availabilityDetails(featured)}
                <p>
                  <strong>Why recommended:</strong>{" "}
                  {recommendationReason(featured, eligible)}
                </p>
                <div className="subcon-contact-actions">
                  <Button
                    variant="primary"
                    icon="clock"
                    onClick={() =>
                      command(
                        {
                          type: "contact_company",
                          companyId: featured.company.id,
                        },
                        "Contact attempt recorded only. No email was sent.",
                      )
                    }
                  >
                    Contact this company
                  </Button>
                  <Button
                    variant="text-button"
                    onClick={() => onCrew(featured.company.id)}
                  >
                    View company details
                    <Icon name="arrow" size={16} />
                  </Button>
                </div>
              </article>
            </section>
          )}
          {!confirmed && !active && !current && !featured && (
            <section className="subcon-recommendation-section">
              <Empty title="No verified companies available">
                No verified companies available. Propose a new company for Admin
                verification.
              </Empty>
              <Button icon="plus" onClick={onNewCompany}>
                Propose new company
              </Button>
            </section>
          )}
          {!confirmed && !active && !current && eligible.length > 1 && (
            <section className="subcon-recommendation-section">
              <div className="section-title">
                <div>
                  <h3>Other verified companies</h3>
                  <p className="role-muted subsection">
                    Ranked by company commitments and currently available
                    workforce.
                  </p>
                </div>
                <details className="subcon-ranking-explainer">
                  <summary>How ranking works</summary>
                  <p>
                    Companies without a conflicting commitment are listed first,
                    followed by fewer active-project commitments and more
                    current company availability.
                  </p>
                  <p>
                    A standing commitment beyond this project’s target start
                    demotes a company. You may still contact any suggested
                    company after verifying availability.
                  </p>
                </details>
              </div>
              <div className="subcon-candidate-filters">
                <Field label="Filter company commitment">
                  <select
                    value={availability}
                    onChange={(event) => setAvailability(event.target.value)}
                  >
                    <option value="all">All availability</option>
                    <option value="uncommitted">
                      No conflicting company commitment
                    </option>
                    <option value="committed">
                      Committed beyond project start
                    </option>
                  </select>
                </Field>
              </div>
              <div className="subcon-candidate-grid">
                {otherCandidates.map((candidate) => {
                  const declined = declinedIds.has(candidate.company.id)
                  return (
                    <article
                      className="subcon-candidate-card"
                      key={candidate.company.id}
                    >
                      <div className="section-title">
                        <span className="company-monogram">
                          {initials(candidate.company.name)}
                        </span>
                        {declined && (
                          <Badge tone="amber">Declined for this project</Badge>
                        )}
                      </div>
                      <h3>{candidate.company.name}</h3>
                      <p>
                        {candidate.company.contact || "No contact person on file"}{" "}
                        · {candidate.company.phone || "No phone on file"}
                      </p>
                      <Badge tone={candidate.committed ? "amber" : "green"}>
                        {candidate.committed
                          ? "Conflicting commitment"
                          : "No conflicting commitment"}
                      </Badge>
                      {availabilityDetails(candidate)}
                      <Button
                        className="full-width"
                        icon="clock"
                        disabled={declined}
                        onClick={() =>
                          command(
                            {
                              type: "contact_company",
                              companyId: candidate.company.id,
                            },
                            "Contact attempt recorded only. No email was sent.",
                          )
                        }
                      >
                        Contact instead
                      </Button>
                      {declined && (
                        <small className="role-muted">
                          This company declined this project and cannot be
                          contacted again.
                        </small>
                      )}
                    </article>
                  )
                })}
              </div>
              {otherCandidates.length === 0 && (
                <Empty title="No other companies match">
                  Change the filter to see the other verified companies.
                </Empty>
              )}
            </section>
          )}
          {!confirmed && !active && !!current && (
            <section className="subcon-recommendation-section">
              <div className="section-title">
                <div>
                  <h3>Suggested subcontractors</h3>
                  <p className="role-muted subsection">
                    Verified companies, ranked by commitments and currently
                    available workforce.
                  </p>
                </div>
                <details className="subcon-ranking-explainer">
                  <summary>How ranking works</summary>
                  <p>
                    Companies without a conflicting commitment are listed first,
                    followed by fewer active-project commitments and more
                    current company availability.
                  </p>
                  <p>
                    A standing commitment beyond this project’s target start
                    demotes a company. You may still contact any suggested
                    company after verifying availability.
                  </p>
                </details>
              </div>
              <div className="subcon-candidate-filters">
                <Field label="Filter company commitment">
                  <select
                    value={availability}
                    onChange={(event) => setAvailability(event.target.value)}
                  >
                    <option value="all">All availability</option>
                    <option value="uncommitted">
                      No conflicting company commitment
                    </option>
                    <option value="committed">
                      Committed beyond project start
                    </option>
                  </select>
                </Field>
              </div>
              <div className="subcon-candidate-grid">
                {filteredCandidates.map((candidate) => {
                  const declined = declinedIds.has(candidate.company.id)
                  return (
                    <article
                      className="subcon-candidate-card"
                      key={candidate.company.id}
                    >
                      <div className="section-title">
                        <span className="company-monogram">
                          {initials(candidate.company.name)}
                        </span>
                        {candidate.company.id === recommendedId && (
                          <Badge tone="green">Recommended</Badge>
                        )}
                        {declined && (
                          <Badge tone="amber">Declined for this project</Badge>
                        )}
                      </div>
                      <h3>{candidate.company.name}</h3>
                      <p>
                        {candidate.company.contact || "No contact person on file"}{" "}
                        · {candidate.company.phone || "No phone on file"}
                      </p>
                      <Badge tone={candidate.committed ? "amber" : "green"}>
                        {candidate.committed
                          ? "Conflicting commitment"
                          : "No conflicting commitment"}
                      </Badge>
                      {availabilityDetails(candidate)}
                      <Button
                        className="full-width"
                        variant="primary"
                        icon="clock"
                        disabled={declined || !!current}
                        onClick={() =>
                          command(
                            {
                              type: "contact_company",
                              companyId: candidate.company.id,
                            },
                            "Contact attempt recorded only. No email was sent.",
                          )
                        }
                      >
                        Contact this company
                      </Button>
                      {declined ? (
                        <small className="role-muted">
                          This company declined this project and cannot be
                          contacted again.
                        </small>
                      ) : (
                        current && (
                          <small className="role-muted">
                            Waiting for {currentCompany?.name || "the company"}
                            ’s response. Record it before contacting another
                            company.
                          </small>
                        )
                      )}
                    </article>
                  )
                })}
              </div>
              {filteredCandidates.length === 0 && (
                <Empty title="No candidates match">
                  Change the filter, or propose a new company for Admin
                  verification.
                </Empty>
              )}
            </section>
          )}
          {history.length > 0 && (
            <section className="subcon-history">
              <h3>Subcontractor history</h3>
              {history.map((selection) => (
                <div className="subcon-history-row" key={selection.companyId}>
                  <span className="file-icon">
                    <Icon
                      name={selection.status === "declined" ? "close" : "users"}
                    />
                  </span>
                  <div>
                    <strong>
                      {state.companies.find(
                        (company) => company.id === selection.companyId,
                      )?.name || "Company record unavailable"}
                    </strong>
                    <p>
                      {selection.status === "declined"
                        ? `Declined for this project${selection.responseAt ? ` · ${new Date(selection.responseAt).toLocaleString()}` : ""}`
                        : selection.status === "archived"
                          ? "Archived before contact"
                          : "Replaced before acceptance"}
                      {selection.replacedBy &&
                        ` · Replaced by ${state.companies.find((company) => company.id === selection.replacedBy)?.name || selection.replacedBy}`}
                    </p>
                  </div>
                </div>
              ))}
            </section>
          )}
          <div className="notice subsection">
            <Icon name="doc" />
            <p>
              <strong>Contact tracking, not email.</strong> “Contact this
              company” records a local attempt with a timestamp. You record the
              actual Accepted or Declined answer manually. No email or
              invitation is sent.
            </p>
          </div>
        </>
      )}
      <section
        className={`lead-activation-panel agreement-submission ${
          active ? "activated" : ""
        }`}
      >
        <div className="section-title">
          <div>
            <span className="eyebrow">FINAL PRE-CONSTRUCTION CHECK</span>
            <h3>
              {clientOwned
                ? "Project activation"
                : "Signed Site PM–Subcontractor Agreement"}
            </h3>
          </div>
          <Badge tone={active ? "green" : "amber"}>
            {active
              ? "Project active"
              : clientOwned && checks.every((c) => c.passed)
                ? "Ready to activate"
                : responsesComplete
                  ? "Ready for signed agreement"
                  : clientOwned
                    ? "Awaiting your acknowledgment"
                    : "Awaiting subcontractor acceptance"}
          </Badge>
        </div>
        {clientOwned && (
          <p className="activation-count" role="status">
            <strong>
              {checks.filter((c) => c.passed).length} of {checks.length}
            </strong>{" "}
            Passed
          </p>
        )}
        <div className="activation-checklist">
          {checks.map((check) => (
            <div key={check.id} className={check.passed ? "passed" : "blocked"}>
              <Icon name={check.passed ? "check" : "clock"} size={17} />
              <span>{check.label}</span>
              <strong>{check.passed ? "Passed" : "Pending"}</strong>
            </div>
          ))}
        </div>
        <p>
          {active
            ? checks.every((check) => check.passed)
              ? "All final checks passed. The project is visible in Active Sites, and the client is active and linked."
              : "This is an existing active project record. Some pre-construction history was not imported; no new activation has been performed here."
            : clientOwned
              ? checks.every((check) => check.passed)
                ? "All five requirements passed. Activation revalidates each one before it is applied."
                : "Activation unlocks after you acknowledge the Admin-assigned subcontractor, any reported issue is resolved, and the other requirements pass."
              : responsesComplete
                ? "Every selected company accepted. Review and confirm the signed agreement; activation is applied only if every final check still passes."
                : clientOwned
                  ? "Agreement upload unlocks after you acknowledge the Admin-assigned subcontractor and any reported issue is resolved."
                  : "Agreement upload unlocks only after all selected companies are approved and have accepted. Declined or replaced companies do not count as committed partners."}
        </p>
        {!clientReady && (
          <div className="role-error">
            <Icon name="alert" />
            <span>
              {client
                ? `${client.name}'s client account is ${client.status}.`
                : "The assigned client account cannot be found."}{" "}
              Ask Admin to resolve the client record. Failed activation does not
              partially promote the project.
            </span>
          </div>
        )}
        {clientOwned ? (
          active ? (
            <div className="uploaded-inline">
              <Icon name="check" />
              <span>
                {work.activation
                  ? `Activated by ${work.activation.by} on ${new Date(work.activation.at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}`
                  : "Project active"}
              </span>
              <Button variant="primary" onClick={onOpenActive}>
                Open Active Sites
              </Button>
            </div>
          ) : (
            <div className="activation-action">
              <Button
                variant="primary"
                icon="check"
                disabled={!checks.every((c) => c.passed)}
                onClick={() => {
                  setActivationError("")
                  setConfirmActivation(true)
                }}
              >
                Activate Project & Move to Active Sites
              </Button>
              <small className="role-muted">
                No second agreement upload is needed. The Admin-uploaded client
                agreement stays on file.
              </small>
            </div>
          )
        ) : (
          <>
            {active && agreement ? (
              <div className="uploaded-inline">
                <Icon name="check" />
                <span>{agreement.name}</span>
                <Button onClick={() => onPreview(agreement)}>
                  View signed agreement
                </Button>
                <Button variant="primary" onClick={onActivated}>
                  Open Active Sites
                </Button>
              </div>
            ) : (
              <Upload
                label={DOC_LABELS[6]}
                owner={actor.name}
                disabled={!responsesComplete}
                buttonLabel="Upload signed subcontractor agreement"
                onSave={(doc) => {
                  if (
                    command(
                      { type: "upload_agreement", doc },
                      "All final checks passed. Project and client access activated.",
                    )
                  )
                    onActivated()
                }}
              />
            )}
            <small className="role-muted">
              PDF, JPG, JPEG or PNG · Maximum 10 MB · File preview and explicit
              confirmation required
            </small>
          </>
        )}
      </section>
      {confirmActivation && clientOwned && (
        <Modal
          title="Activate this project?"
          subtitle={project.name}
          onClose={() => setConfirmActivation(false)}
        >
          <p>
            Lead Site PM: <strong>{actor.name}</strong>
          </p>
          <div className="activation-checklist">
            {checks.map((check) => (
              <div key={check.id} className="passed">
                <Icon name="check" size={17} />
                <span>{check.label}</span>
                <strong>Passed</strong>
              </div>
            ))}
          </div>
          <div className="notice subsection">
            <Icon name="shield" />
            <div>
              <strong>After activation</strong>
              <ul className="plain-list">
                <li>
                  The project moves to Active Sites in Mobilization at 0%.
                </li>
                <li>Your name and the activation time are recorded.</li>
                <li>The client gets project access.</li>
                <li>Intake is locked; this cannot be repeated.</li>
              </ul>
            </div>
          </div>
          {activationError && (
            <p className="error" role="alert">
              {activationError}
            </p>
          )}
          <div className="modal-actions">
            <Button onClick={() => setConfirmActivation(false)}>Cancel</Button>
            <Button
              variant="primary"
              icon="check"
              onClick={() => {
                if (
                  command(
                    { type: "activate_project" },
                    "Project activated. Mobilization starts at 0%.",
                  )
                ) {
                  setConfirmActivation(false)
                  setActivatedNow(true)
                } else
                  setActivationError(
                    "Activation was not applied. A requirement is no longer met or the project is already active.",
                  )
              }}
            >
              Confirm Activation
            </Button>
          </div>
        </Modal>
      )}
      {activatedNow && (
        <Modal
          title="Project Successfully Activated!"
          subtitle={project.name}
          onClose={() => setActivatedNow(false)}
        >
          <div className="success-state">
            <span>
              <Icon name="check" size={32} />
            </span>
            <h3>{project.name} is now active.</h3>
            <p>Mobilization starts at 0%. Client access is enabled.</p>
          </div>
          <div className="modal-actions">
            <Button
              variant="primary"
              onClick={() => {
                setActivatedNow(false)
                onOpenActive()
              }}
            >
              Go to Active Sites
            </Button>
          </div>
        </Modal>
      )}
      {agreementOpen && clientOwned && (
        <AgreementPreviewModal
          project={project}
          actor={actor}
          onAction={onAction}
          onClose={() => setAgreementOpen(false)}
        />
      )}
    </section>
  )
}

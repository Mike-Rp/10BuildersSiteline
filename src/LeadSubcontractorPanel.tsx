import { useState } from "react"
import { Badge, Button, Empty, Field, Icon, Modal } from "./ui"
import { Upload } from "./panels"
import { AgreementPreviewModal } from "./ClientSubconReview"
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
  activeSubcontractors,
  allocationReady,
  clientSubconAgreement,
  clientSubconReview,
  openClientSubconIssue,
  leadId,
  subcontractorRecommendation,
  subcontractorRecommendations,
  workflowFor,
  type WorkflowCommand,
} from "./workflows"

type Recommendation = ReturnType<typeof subcontractorRecommendation>
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
  const [replaceId, setReplaceId] = useState("")
  const [replacement, setReplacement] = useState("")
  const [replaceError, setReplaceError] = useState("")
  const [agreementOpen, setAgreementOpen] = useState(false)
  const [confirmActivation, setConfirmActivation] = useState(false)
  const [activationError, setActivationError] = useState("")
  const [activatedNow, setActivatedNow] = useState(false)
  const work = workflowFor(project)
  const team = activeSubcontractors(project)
  const accepted = team.filter(
    (selection) => selection.status === "accepted",
  ).length
  const awaiting = team.filter(
    (selection) => selection.status === "contacted",
  ).length
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
    (candidate) =>
      !team.some((selection) => selection.companyId === candidate.company.id),
  )
  const filteredCandidates = candidates.filter(
    (candidate) =>
      availability === "all" ||
      (availability === "uncommitted"
        ? !candidate.committed
        : candidate.committed),
  )
  const replacedCompany = state.companies.find(
    (company) => company.id === replaceId,
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
  function chooseReplacement(companyId: string) {
    setReplaceId(companyId)
    setReplacement("")
    setReplaceError("")
  }
  function availabilityDetails(candidate: Recommendation) {
    return (
      <div className="subcon-availability">
        {candidate.committed ||
        candidate.company.availability === "committed" ? (
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
              { label: "Select project partners", complete: team.length > 0 },
              { label: "Record their decisions", complete: responsesComplete },
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
            <span>Selected partners</span>
            <strong>{team.length.toString().padStart(2, "0")}</strong>
          </div>
          <div>
            <span>Accepted & locked</span>
            <strong>{accepted.toString().padStart(2, "0")}</strong>
          </div>
          <div>
            <span>Awaiting a decision</span>
            <strong>{awaiting.toString().padStart(2, "0")}</strong>
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
          <section className="subcon-selected-section">
            <div className="section-title">
              <h3>
                Proposed project team{" "}
                <span className="count-pill">{team.length}</span>
              </h3>
              {!active && (
                <Button icon="plus" onClick={onNewCompany}>
                  Suggest Company
                </Button>
              )}
            </div>
            <p className="role-muted subsection">
              Selecting a company does not record its acceptance. Every selected
              partner must be approved and manually accepted before the signed
              agreement.
            </p>
            <div className="subcon-selected-grid">
              {team.map((selection) => {
                const company = state.companies.find(
                  (company) => company.id === selection.companyId,
                )
                if (!company)
                  return (
                    <div className="role-error" key={selection.companyId}>
                      A selected company record is missing. Activation is
                      blocked; ask Admin to review the request.
                    </div>
                  )
                const candidate = subcontractorRecommendation(
                  state,
                  project,
                  company,
                )
                const companyApproved = company.status === "approved"
                const locked = selection.status === "accepted"
                return (
                  <article
                    className={`subcon-team-card ${
                      locked ? "is-accepted" : ""
                    }`}
                    key={company.id}
                  >
                    <div className="section-title">
                      <span className="company-monogram">
                        {initials(company.name)}
                      </span>
                      <Badge tone={locked ? "green" : "amber"}>
                        {!companyApproved
                          ? `${company.status} company`
                          : locked
                            ? "Accepted · locked"
                            : selection.status === "contacted"
                              ? "Contact attempt recorded"
                              : "Not contacted"}
                      </Badge>
                    </div>
                    <h3>{company.name}</h3>
                    <p>
                      {company.contact || "No contact person on file"} ·{" "}
                      {company.phone || "No phone on file"}
                    </p>
                    {availabilityDetails(candidate)}
                    {locked ? (
                      <div className="subcon-acceptance-lock">
                        <Icon name="shield" />
                        <div>
                          <strong>Acceptance is locked</strong>
                          <p>
                            This company cannot be swapped, archived, or changed
                            to Decline.
                          </p>
                        </div>
                      </div>
                    ) : !companyApproved ? (
                      <div className="notice subsection">
                        <Icon name="clock" />
                        <p>
                          Administrator approval is required before contacting
                          or accepting this company. It does not count as
                          committed workforce.
                        </p>
                      </div>
                    ) : (
                      !active && (
                        <div className="subcon-contact-actions">
                          <Button
                            icon="clock"
                            onClick={() =>
                              command(
                                {
                                  type: "contact_company",
                                  companyId: company.id,
                                },
                                "Contact attempt recorded only. No email was sent.",
                              )
                            }
                          >
                            Try to Contact Subcon
                          </Button>
                          {selection.status === "contacted" && (
                            <div className="subcon-decision-buttons">
                              <Button
                                variant="primary"
                                icon="check"
                                onClick={() =>
                                  command(
                                    {
                                      type: "respond_company",
                                      companyId: company.id,
                                      accepted: true,
                                    },
                                    "Actual acceptance recorded. This subcontractor is now locked.",
                                  )
                                }
                              >
                                Record Accept
                              </Button>
                              <Button
                                variant="danger-ghost"
                                onClick={() =>
                                  command(
                                    {
                                      type: "respond_company",
                                      companyId: company.id,
                                      accepted: false,
                                    },
                                    "Decline recorded. This company can now be replaced.",
                                  )
                                }
                              >
                                Record Decline
                              </Button>
                            </div>
                          )}
                        </div>
                      )
                    )}
                    {(selection.contactAt || selection.responseAt) && (
                      <dl className="subcon-timestamps">
                        {selection.contactAt && (
                          <div>
                            <dt>Contact attempt</dt>
                            <dd>
                              {new Date(selection.contactAt).toLocaleString()}
                            </dd>
                          </div>
                        )}
                        {selection.responseAt && (
                          <div>
                            <dt>Decision recorded</dt>
                            <dd>
                              {new Date(selection.responseAt).toLocaleString()}
                            </dd>
                          </div>
                        )}
                      </dl>
                    )}
                    <div className="subcon-card-footer">
                      {companyApproved && (
                        <Button
                          variant="text-button"
                          onClick={() => onCrew(company.id)}
                        >
                          View company details
                          <Icon name="arrow" size={16} />
                        </Button>
                      )}
                      {!locked && !active && (
                        <div className="button-group">
                          <Button onClick={() => chooseReplacement(company.id)}>
                            Replace subcontractor
                          </Button>
                          <Button
                            variant="icon-button"
                            icon="close"
                            aria-label={`Archive ${company.name} from proposed team`}
                            onClick={() =>
                              command(
                                {
                                  type: "archive_company",
                                  companyId: company.id,
                                },
                                "Company archived from the proposed team.",
                              )
                            }
                          />
                        </div>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
            {team.length === 0 && (
              <Empty title="Choose your first project partner">
                Review the ranked candidates below. An empty team cannot proceed
                to agreement upload.
              </Empty>
            )}
          </section>
          {!active && (
            <section className="subcon-recommendation-section">
              <div className="section-title">
                <div>
                  <h3>Suggested subcontractors</h3>
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
                    demotes a company and excludes it from automatic selection.
                    You may still select it manually after verifying
                    availability.
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
                {filteredCandidates.map((candidate) => (
                  <article
                    className="subcon-candidate-card"
                    key={candidate.company.id}
                  >
                    <div className="section-title">
                      <span className="company-monogram">
                        {initials(candidate.company.name)}
                      </span>
                      <Badge tone={candidate.committed ? "amber" : "green"}>
                        {candidate.committed
                          ? "Conflicting commitment"
                          : "No conflicting commitment"}
                      </Badge>
                    </div>
                    <h3>{candidate.company.name}</h3>
                    {availabilityDetails(candidate)}
                    <Button
                      className="full-width"
                      variant="primary"
                      icon="plus"
                      onClick={() =>
                        command(
                          {
                            type: "select_company",
                            companyId: candidate.company.id,
                          },
                          "Company selected. Record contact and its actual response next.",
                        )
                      }
                    >
                      Add to proposed team
                    </Button>
                  </article>
                ))}
              </div>
              {filteredCandidates.length === 0 && (
                <Empty title="No additional candidates match">
                  Change the filters, suggest a company, or review the
                  companies already on the proposed team.
                </Empty>
              )}
            </section>
          )}
          {history.length > 0 && (
            <section className="subcon-history">
              <h3>Archived team history</h3>
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
                        ? "Declined by subcontractor"
                        : selection.status === "archived"
                          ? "Archived before acceptance"
                          : "Replaced before acceptance"}
                      {selection.replacedBy &&
                        ` · Replaced by ${state.companies.find((company) => company.id === selection.replacedBy)?.name || selection.replacedBy}`}
                    </p>
                  </div>
                  {!active && selection.status === "declined" && (
                    <Button
                      onClick={() => chooseReplacement(selection.companyId)}
                    >
                      Choose replacement
                    </Button>
                  )}
                </div>
              ))}
            </section>
          )}
          <div className="notice subsection">
            <Icon name="doc" />
            <p>
              <strong>Contact tracking, not email.</strong> “Try to Contact
              Subcon” records a local attempt and timestamp. Karlo records the
              actual Accept or Decline manually. No email or invitation is sent.
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
      {replaceId && (
        <Modal
          title="Replace subcontractor"
          subtitle={replacedCompany?.name || "Previous company"}
          onClose={() => setReplaceId("")}
        >
          <div className="notice">
            <Icon name="shield" />
            <p>
              Accepted companies cannot be replaced. The new company starts
              unconfirmed and requires its own contact attempt and manually
              recorded response.
            </p>
          </div>
          <Field label="Replacement company">
            <select
              value={replacement}
              onChange={(event) => setReplacement(event.target.value)}
            >
              <option value="">Choose an approved replacement</option>
              {candidates
                .filter((candidate) => candidate.company.id !== replaceId)
                .map((candidate) => (
                  <option
                    value={candidate.company.id}
                    key={candidate.company.id}
                  >
                    {candidate.company.name} · {candidate.availableManpower}{" "}
                    manpower available
                    {candidate.committed ? " · conflicting commitment" : ""}
                  </option>
                ))}
            </select>
          </Field>
          {replaceError && (
            <p className="error" role="alert">
              {replaceError}
            </p>
          )}
          <div className="modal-actions">
            <Button onClick={() => setReplaceId("")}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!replacement}
              onClick={() => {
                if (
                  command(
                    {
                      type: "replace_company",
                      companyId: replaceId,
                      replacementCompanyId: replacement,
                      expectedVersion: work.version,
                    },
                    "Replacement selected. New contact and response are required.",
                  )
                )
                  setReplaceId("")
                else
                  setReplaceError(
                    "The replacement was not applied. Check the current team status and try again.",
                  )
              }}
            >
              Confirm replacement
            </Button>
          </div>
        </Modal>
      )}
    </section>
  )
}

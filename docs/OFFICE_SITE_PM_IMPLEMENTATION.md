# Office PM and Site PM implementation

## Opening a workspace

Use **Demo session** in the top bar to choose Renz (Office PM), Karlo (Lead Site PM on Alden Heights), Rafael (Site PM), or another active engineer. This explicitly changes the simulated local actor; it is not production authentication or an Administrator impersonation privilege. Administrator modules remain available by selecting Patricia.

All workspaces share the same existing project, company, account, document and activity records. The existing browser storage key is retained, so previous Administrator work is not replaced. Session choice persists in session storage; records persist in local storage, with original uploaded files in IndexedDB.

## Enforced intake sequence

1. Only the assigned Office PM accepts a pending project.
2. Immediate confirmation offers **Continue to Document Upload** and **Later**.
3. Six required document types come from `DOC_LABELS`; each validated file requires confirmation. Existing uploads stay locked.
4. Incomplete work can be resumed, including after reload.
5. No Site PM acceptance is allowed before all six files.
6. The Mobilization owner (project-specific Lead) accepts first.
7. A remaining Site PM accepts all their own pending project phases.
8. Only the Lead can coordinate subcontractors after all phase assignments are confirmed.
9. Contact records a local attempt only; actual acceptance/decline is entered manually. Accepted companies cannot be removed or swapped.
10. Activation requires a nonempty accepted, approved team; the Lead's signed agreement; all prior gates; and an eligible client record. There is no Admin or Office PM shortcut.

`src/workflows.ts` validates the actor, account state, project scope, phase ownership, file preset, current record status and applicable versions on every workflow command. Read-only document restrictions also validate canonical stored records rather than trusting a caller's label.

## Modules

- Office PM: Dashboard, Confirmation queue, Documents and project repositories, Active sites and monitoring, Deadlines, progress reviews, rework decisions, QA/QC approvals/rejection, Site PM response tracking/reassignment, Schedule performance, Archive, Activity log, Preferences.
- Site PM: Dashboard, sequential assignments, current and completed-phase Active Sites workspaces, Deadlines, restricted agreement/checklist repository, Lead subcontractor coordination, new-company requests, queued Excel imports, company workforce details and exports, current-phase field updates/evidence/issues, QA/QC submissions, diary and photos, Schedule performance, Archive, Activity log, Preferences.
- Notification unread/read state and mute preferences are per actor. Feeds are project/recipient scoped. Demo-session changes and workflow decisions are recorded.

## Lead Site PM subcontractor matching and replacement

The Lead coordination panel now separates selected partners, actual contact/response records, suggested companies, replacement history, and final activation checks.

- Matching uses the HTML's verified Alden Heights trade/scope references (Meridian 94, Cordova 89, Bantay 83 when that company exists), blended as **70% reference match + 30% current complete-certification coverage**.
- References apply only to that featured project. Companies/projects without source matching data remain explicitly unscored directory choices; no extra matching percentages are invented.
- Certification requirements combine DOLE-Safety with the source trade-specific requirement. Coverage and displayed scores recompute from the current workforce records.
- Standing company commitments beyond the project's actual target start demote candidates and exclude them from automatic selection. Other project commitments and available-worker counts are displayed separately. Conflicting companies remain manually selectable as in the HTML, with a warning and required manual confirmation.
- `replace_company` is an atomic, Lead-only command. It rejects accepted companies, nonapproved replacements, duplicates, same-company replacements, active-project changes, and stale supplied versions.
- A replaced unaccepted company is recorded as **replaced**, not falsely described as having declined. An actual decline retains its response timestamp and replacement history. Replacements start selected/unconfirmed and need a new contact attempt and actual Accept/Decline.
- Contact remains local-only. Missing Accept/Decline values are rejected instead of silently becoming Decline.
- Activation rechecks the full source-supported checklist after preparing the signed agreement and client linkage. A failed check returns no changed state; it cannot partially promote the project.

## Timers and progress

- Assignment response soft target: one business day; hard deadline: organization rule, default three business days. Weekends are excluded; no holiday calendar was defined.
- Lead hard expiry records nonresponse, clears the assignment, returns intake for Office PM reassignment, and resets required-document readiness while retaining prior file metadata in an internal audit list.
- Informational progress updates may auto-approve after three calendar days. Stage/percentage-changing updates remain pending and are escalated. Review resolution does not silently apply a requested numeric change.
- QA/QC evidence escalates after three days but never auto-approves. Rework always requires a manual Office PM decision.
- Approved current-phase checklists advance only to a named, already-confirmed next owner. The previous owner becomes read-only.
- New projects distribute progress across all seven phase checklists. Existing seeded active projects retain their recorded baseline and distribute remaining progress across remaining phases; no missing historical evidence is fabricated. Rework uses the source's minimum of current percentage and stage floor, then anchors subsequent progress to new approvals rather than immediately undoing the rollback.

The timer processor runs on opening the app and every 30 seconds. It is not a server job and cannot run while the browser is closed.

## Source limitations retained honestly

- Schedule charts remain explicitly illustrative seeded S-curves.
- Seed document metadata has no original binary; new uploads retain the actual selected file.
- Site PM submitted agreements are watermarked and have no application download action. This is a UI restriction, not DRM or secure file authorization.
- Static source archive examples are not represented as a general retention engine. Read-only views derive from completed records, resolved responses, request results and recorded changes. The later Active Sites rebuild implements the source's stated approved-Closeout completion condition; other automatic retention rules remain unimplemented.
- Email, secure authentication, server authorization, shared storage, real concurrent transactions and durable background notifications require backend services.
- Public sharing remains excluded. No stage fast-forward action is provided that could bypass approved QA/QC or assignment gates.

## Verification

Automated rule tests cover intake ordering, role/project/Lead permissions, upload presets, locks, activation, QA/QC versions, rejection/resubmission, handoff, review timing, deadline expiry, canonical document access and queued company imports. Browser verification covers the complete Renz → documents → Karlo → Rafael → subcontractors → agreement → activation → QA/QC → Rafael handoff path, repository restrictions, navigation and mobile containment.

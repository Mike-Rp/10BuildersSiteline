# SITELINE — Functional Source Audit

## 1. Scope, authority, and evidence

Source: attachment `0f4ff515-578a-4d7b-9e3d-4baa7f3dc73a`, resolved filename `SITELINE_subcontractor_swap_locked (1).html`, 11,942 lines. Line references below refer to that attachment, not this document.

This is a static audit of HTML controls, inline CSS interaction states, JavaScript handlers, state, guards, and side effects. No browser interaction tests were performed; runtime outcomes not established by source are **Unverified**. No visual implementation was started. Only audit documentation was added.

Repository: React 19/Vite 8/Tailwind v4. `src/App.tsx` is an empty component; `src/index.css` only imports Tailwind. There is no existing SITELINE React implementation or backend to migrate.

Authority: approved prompt revisions > latest HTML executable logic > other source data/validation > nonfunctional UX improvements. Comments and labels are evidence of intent, not proof of execution. In particular, stale “SPM first, documents later” copy does not override the approved documents-first intake sequence.

### Status legend

- **Implemented/demo**: local state or DOM behavior exists; not production/backend functionality.
- **Partial**: handler exists but has incomplete wiring, validation, or project generalization.
- **Static**: rendered example/copy without a verified state-changing implementation.
- **Unverified**: not established by the source or not exercised at runtime.
- **Excluded**: deliberately not to be rebuilt.

No entry marked Implemented/demo implies secure authorization, persistent storage, working email, or production authentication.

The companion `SITELINE_SOURCE_INDEX.md` provides a function index, original HTML control inventory, and activity call-site inventory to support this audit.

## 2. Navigation inventory

`NAV_CONFIG`, lines 3582–3627; `navItemKey`, `applySection`, `buildSidebarNav`, `toggleNavGroup`, `navTo`.

| Role | Navigation |
|---|---|
| Administrator | Operate: Dashboard; Project Intake; Document Repo → Projects, Engineer Directory; Engineer Directory; Subcon Directory; Team. Review: Archive. |
| Office PM | Operate: Dashboard; Documents; Confirmation Queue; SPM Responses. Review: Rework & Updates; Archive. |
| Site PM | Operate: Dashboard; Assignment Request; Active Sites; Document Repo; Subcon Directory; Archive. |
| Client | My Project → Project Overview, using an anchor rather than section paging. |
| Shared | Notification bell, View full activity log, Activity Log, Settings, session identity, Log out; Admin-only “view as” role switches. |

**Excluded everywhere:** Share Links navigation, External Share Links table, Create Share Link, token/copy/revoke controls, default share expiry setting, share-link archive tab, and share-link events. Do not replace these with another public-sharing mechanism.

## 3. Administrator module inventory

Each entry specifies purpose/display, authority, inputs/actions, validation/dependencies, implementation/functions, events, and related modules. “No event” means no explicit `logActivity` call for that action, not a requirement to invent one.

### A01. Dashboard

- **Purpose/display:** operational overview; Total Projects, Pending OPM Confirmation, Team, Archived Records; monitoring and schedule cards; nonresponsive-assignment/progress/checklist escalation banner; license alerts.
- **Authority:** Admin view. Admin can view other role interfaces, but action guards still use the actual session role.
- **Inputs/actions:** navigation, Review licenses, Dismiss escalation, open project details.
- **Rules/dependencies:** a mix of literal KPI values and selectively refreshed values; not all totals derive from live records. License alerts use account license state. One shared escalation banner is reused by multiple escalation types.
- **Functions/status:** Implemented/demo + static KPIs. `renderLicenseAlertBanner`, `dismissEscalationBanner`, `renderAccountsTable`, `renderAdminDocRepo`.
- **Events/relations:** escalation events are emitted by workflow checks, not dismissal. Related: A02/A03/A11, shared notifications.

### A02. Active Sites — Project Monitoring

- **Display:** Project, Phase, Progress, Status, Action; stage and percentage, issue/pending states.
- **Authority/actions:** Admin views all `activeSites`; project link or View Details opens monitoring. No Admin Request Update button.
- **Inputs/rules:** site ID must resolve. No project-level scope check in `openProjectDetail`.
- **Functions/status:** Implemented/demo. `renderActiveSitesMonitor(..., false)`, `openProjectDetail`, `pdStatusLabel`.
- **Events/relations:** no explicit open-detail event. Shared project detail contains personnel, phase reassignment exception, schedules, photos, internal notes, rework.

### A03. Schedule Performance

- **Display/actions:** today's planned/actual bars; cumulative planned/actual line chart; ahead/behind/on-pace variance. No schedule editing, filter, or chart drilldown controls verified.
- **Authority/inputs:** all four roles have separate illustrative chart configurations; project detail uses a site-specific seed.
- **Rules/status:** Implemented/demo, **synthetic data**, not live aggregation despite aggregation labels. ±1.5 percentage-point variance determines ahead/behind; between those thresholds is on pace.
- **Functions:** `seededRandom`, `plannedCurve`, `generateScheduleSeries`, `fmtPct`, `buildDailyBarSVG`, `buildCumulativeLineSVG`, `renderSchedulePerformance` (11733–11882).
- **Events/relations:** no explicit event. Related monitoring dashboards and detail.

### A04. New Project Intake / Project Details modal

- **Purpose/display:** intake launcher opens project details and generated allocation; Draft → Suggested Allocation → Confirmed → Sent to OPM → SPM Review stepper.
- **Authority:** Admin (`openProjectIntakeModal`, `confirmAndSendToOPM`).
- **Inputs:** name; type (Residential, Mixed-Use, Commercial, Infrastructure, Industrial, Renovation); floor area; floor count; target start; existing/new client; signed Client Contract Agreement; optional client-provided subcontractor toggle, name, trade, agreement.
- **Actions:** open/close modal; select type; upload/confirm documents; create/select client; re-run allocation; swap OPM; view profile; Confirm & Send.
- **Validation:** required nonblank name/area/floors/start/client and selected type. No verified numeric positivity, real date, or date-order validation in `validateProjectDetailsBeforeAllocation`. Client must resolve. Admin contract required. If client-subcontractor toggle is set, subcontractor name and uploaded agreement required; trade is optional.
- **State:** `projectIntakeModalStep`, `projectDraftClientId`, `pendingProjectClient`, contract globals, `phaseAssignments`, queue. Selection of type immediately reveals allocation; compatibility “continue/back” functions exist but no separate Continue control is required.
- **Status/functions:** Partial, featured-project-oriented. `openProjectIntakeModal`, `closeProjectIntakeModal`, `updateProjectIntakeStepper`, `showSuggestedAllocationForSelectedType`, `goToSuggestedAllocation`, `backToProjectDetails`, `validateProjectDetailsBeforeAllocation`, `confirmAndSendToOPM`, `advanceAdminStepper`.
- **Events/relations:** “New project awaiting your confirmation” → OPM/confirmqueue. Opens Project Creation Complete modal. Pending queue items with the same name are updated, not duplicated; this is not a general unique-project-name rule. Related client draft, allocation, contract, intake log.

### A05. Intake client selection / Create Client Account modal

- **Display/input:** existing client selector and email/scope meta; client/company name, contact person, email, contact number. Saved-state banner.
- **Authority/actions:** Admin saves a client draft, updates draft, selects existing client, cancels/done.
- **Validation:** name/email required; email regex; case-insensitive duplicate email. Existing client duplicate selects that account; non-client duplicate errors. Suspended accounts excluded from selector, but duplicate-client branch does not itself reject suspended clients.
- **Dependencies:** saving draft neither creates an active account nor expands project scope. Draft is stored on queue item at successful intake, then activated only at final gate. Actual temp password is generated during draft save; UI says it will be assigned at activation.
- **Functions/status:** Implemented/demo with activation gaps. `populateProjectClientSelect`, `handleProjectClientSelection`, `openNewClientModal`, `closeNewClientModal`, `createClientFromProjectIntake`, `escapeClientHtml`.
- **Events/relations:** no draft-save event; new-account activation event later. Related A04 and C06.

### A06. Suggested Allocation

- **Display:** recommended OPM identity, match score, project specializations; phase-by-phase SPM names, discipline requirements, match percentage; suggested engineer headcount and size tier.
- **Authority/actions:** Admin swaps OPM, views account profile, re-runs full allocation. Initial intake SPM rows are generated display-only, **not individual dropdown overrides**; resubmission does have per-phase dropdowns.
- **Inputs/rules:** project type/size/floors, accounts/scope, exclusions/cooldowns, current active leads. OPM prefers matching project-type tag, then alphabetical name; 94/78 are illustrative display scores. Suspended/cooldown/excluded OPMs removed; max-project setting and license eligibility are not enforced here.
- **SPM rules:** ranks non-suspended SPMs by required-tag coverage, matched count, name; active Mobilization leads excluded from other selection. No minimum match cutoff: 0% candidates can remain. Invited accounts can remain because filtering is “not suspended,” not “active.” `excludeSiteId` exists but not consistently supplied by callers.
- **Headcount:** normalize phase engineer text to known disciplines. Sum discipline slots across six non-Closeout phases. Small ×1; medium ×2 if area ≥10,000 sqm OR floors ≥10; large ×3 if area ≥30,000 OR floors ≥25. This is suggested slots, not actual worker count.
- **Status/functions:** Implemented/demo; no real optimization or location matching. `pickBestOpm`, `refreshOpmSuggestion`, `swapOpmCandidate`, `viewOpmCandidateProfile`, `rerunAllocationSuggestion`, `tagsRequiredForPhase`, `activeLeadSpmNames`, `spmCandidatesForPhase`, `sizeTierFor`, `baseEngineerSlotsForType`, `renderPhaseAssignmentTable`, `setPhaseAssignment`, `summarizePhaseAssignments`.
- **Events/relations:** re-run completion button feedback, no activity event. Related account scope, phase snapshots, resubmit.

### A07. Project Intake Log / Resubmit Project modal

- **Display:** Project, Type, Sqm/Floors, OPM, SPM summary, Status; conditional Resubmit button. Modal shows immutable original details, previous OPM note, OPM selector, per-phase SPM selectors, headcount, exclusions.
- **Authority/actions:** Admin re-runs recommendation, overrides resubmit phase picks, submits/cancels.
- **Validation/state:** OPM selection required; every-phase completeness is not explicitly validated. Prior OPM permanently excluded for this project; Request Changes also applies a global 24-hour OPM cooldown. Excluded SPM list is supported; complete population policy is Unverified. Resubmission updates queue status to `pending`, clears resolution/decline data, stores snapshot; does not implement generic project mutation.
- **Functions/status:** Implemented/demo, DOM log rather than persistent records. `syncIntakeLogStatus`, `syncIntakeLogOpm`, `syncIntakeLogSpm`, `showResubmitControl`, `openResubmitModal`, `populateResubmitOpmSelect`, `resubmitSpmCandidatesForPhase`, `setResubmitPhaseAssignment`, `renderResubmitPhaseAssignmentTable`, `summarizeResubmitPhaseAssignments`, `updateResubmitHeadcount`, `rerunResubmitSuggestion`, `confirmResubmit`, `closeResubmitModal`, cooldown functions.
- **Events/relations:** “Project reassigned to you for confirmation” → OPM; cooldown creation/clear → Admin account activity. Related OPM confirmation and account drawer demo override.

### A08. Pending Subcontractor Approvals

- **Display:** company, trade, contact meta, submitting SPM/project, pending badge/count; stale-conflict area.
- **Authority/actions:** Admin Approve — Add to Directory; Reject; demo concurrent action.
- **Inputs/validation:** request ID + expected version; mismatch displays conflict and refreshes. Pending company does not count as committed workforce.
- **State transitions:** approval changes status/version, appends same object to `ALL_SUBCONS`; rejection removes team/request record. Approved object may remain in pending array; directory aggregation deduplicates IDs.
- **Functions/status:** Implemented/demo. `renderAdminPendingSubcons`, `approvePendingSubcon`, `rejectPendingSubcon`, `simulateSubconConflict`.
- **Events/relations:** request approved/rejected events target Admin, not requesting SPM; original request event targets SPM. Related SPM new-company forms, directory, consent.

### A09. Project Document Repository

- **Display:** project folders, stage/progress, 6 OPM docs + signed subcontractor agreement, upload counts, internal progress history, project-specific OPM/SPM engagement agreements.
- **Authority/actions:** Admin expands folders, views watermarked record previews, downloads individual records or Download All; uploads signed engineer engagement agreements.
- **Inputs/rules:** selected project/engineer and document preset. Engagement applies to engineers whose role starts Office PM/Site PM, not supporting QA/QC or safety roles. No activation prerequisite for engagement documents verified.
- **State:** folders iterate `activeSites`; featured preactivation project is not generically included. Live featured docs read DOM; other docs use `DOC_REPO_STATIC`. Download All downloads uploaded registered items separately, not ZIP and not all employment/engagement/checklist files.
- **Functions/status:** Partial. `renderAdminDocRepo`, `docRepoFolderHtml`, `toggleDocRepoFolder`, `repoRowHtml`, `getProjectDocumentItems`, `docRepoProgressHtml`, `downloadAllDocsForProject`, engagement functions.
- **Events/relations:** watermarked preview `view` activity; engagement upload `account` activity. Repository “downloads” are mostly text placeholders. Related A10/O05/S04/C04.

### A10. Engineer Document Repository

- **Display:** separate engineer folders for non-client accounts; identity/role/license search; PRC licensure and company-wide employment contract.
- **Authority/actions:** Admin expand folder, navigate/handle license documents, upload/view/download employment contract. Project docs remain separate.
- **Rules/state:** account license metadata and lazy employment contract record; license repository previews are records, not necessarily stored license binaries.
- **Functions/status:** Partial. `toggleEngineerDocRepoFolder`, `engineerLicenseDocRowHtml`, `engineerDocRepoFolderHtml`, `renderAdminDocRepo`, employment helpers.
- **Events/relations:** document view event; employment upload account event. Related A11/A13.

### A11. Engineer Directory / license dialogs

- **Display:** in-house Admin/OPM/SPM only; name, role, scope, account status, license/expiry, certs, email/phone, added date, employment agreement, project history, login-blocked badge.
- **Actions/inputs:** search name/role/scope; role/status/license filters; expand; View Account; Add License (number, expiry, optional comma-separated certifications, required supporting file); renewal upload → confirmation/cancel; Undo Renewal (demo); Notify engineer.
- **Validation:** first license requires number/expiry/file, document preset. No verified future-expiry or license uniqueness check. Expiring soon ≤90 days, expired <0; computed against fixed `REFERENCE_TODAY = 2026-07-29`, not actual today. OPM/SPM login blocked after expiry beyond default 7-day grace; missing license does not block.
- **State:** renewal flips misleading `licenseUploadPending=true`, interpreted immediately as Renewed and bypassing grace; no new expiry entry and no separate reviewer. First-license path stores filename/metadata, not binary. Project history scans live engineers and intake suggestions by name.
- **Functions/status:** Partial. `renderEngineerDirectory`, `engineerCardHtml`, `toggleEngineerCard`, `viewLinkedAccount`, `viewEngineerRecord`, `engineerProjectHistory`, `certStatus`, `engineerLicenseStatus`, `licenseGraceExpired`, add-license/renewal/undo/notification helpers.
- **Events:** license added `account`; reminder `notice` to engineer role/`engineers` (not a valid section for all recipient roles). Renewal confirmation/undo have no explicit event.

### A12. Subcontractor Directory / personnel records

- **Display:** company grouped cards: name/trade, contact/contact person, licensure summary, availability, busy/pending/client-locked badges; expand crew, each worker's identity, discipline, phone, active/inactive, license/expiry/certs, availability/current project/history.
- **Authority:** Admin and Site PM share data; independent filters/expanded state. No OPM/client directory navigation.
- **Actions/inputs:** search company/trade/worker/discipline; busy/open, license, availability, discipline filters; expand crew/person history; Download Crew List CSV.
- **Rules:** Busy = at least two distinct projects/standing commitments. Company license summary aggregates worker license statuses. Filters operate on workers, with company name/trade search fallback. Pending and client-provided companies included, deduplicated.
- **Status/functions:** Implemented/demo. `renderDirectoryForScope`, `renderSubconDirectory`, `renderSPMSubconDirectory`, `buildSubconDirectoryGroups`, `aggregateAllWorkers`, company summary helpers, worker render/toggle helpers.
- **Export limitation:** `generateCompanyLaborPool` produces a deterministic synthetic 20–30-person labor roster. CSV is **not the actual stored crew**. Columns: Name, Role, Discipline, Subcontractor Company, Contact Number, Status. `csvEscapeCell`, `downloadCompanyLaborCSV`. No explicit export event.

### A13. Add Account / Team / Account view-edit panel

- **Display:** table Name/email, Role, Scope, Status, Added; OPM cooldown badge; search and All/Admin/OPM/SPM/Client chips. Add form success banner/password Copy; account detail view and edit mode.
- **Authority/actions:** Admin provisions; create-form/status/cooldown handlers guarded. `saveAccountEdit` and opening/rendering panel lack their own role guards. CSS positions the account “drawer” as a centered modal despite function naming.
- **Inputs:** name, email, optional phone, role, temp password Regenerate; SPM 1–3 discipline tags; OPM 1–2 project-type tags (Residential/Commercial/Mixed-Use); client at least one linked project; Admin no scope. Edit name/email/phone/scope/OPM types; role immutable.
- **Validation:** create/edit name/email required, duplicate emails case-insensitive; generic create/edit do not run the intake client's email regex. Edit validates canonical OPM types and 1–2 count, SPM disciplines and 1–3 count. Client edit scope is free-text project names with no verified lookup. No verified phone/password-strength validation.
- **State:** creates invited account but **does not store displayed temp password**; login blocks invited accounts rather than activating them. Suspend toggles any nonsuspended account to suspended; Reactivate sets active. No self/last-Admin safeguard verified. Editing mutates identity before validating SPM scope, permitting partial failed saves and name-based assignment drift.
- **Functions/status:** Partial. `createAccount`, `generateTempPassword`, `regenerateTempPassword`, `copyCreatedPassword`, `renderAcctScopeField`, `scopeSummary`, `renderAccountsTable`, `setAcctRoleFilter`, `toggleCreateAccountForm`, `openAccountDrawer`, `renderAccountDrawer`, `saveAccountEdit`, `toggleAccountStatus`, `clearOpmCooldown`, close helper.
- **Events:** new account, details updated, suspended/reactivated, cooldown applied/cleared (`account`, Admin). Clipboard failures silently ignored.

### A14. Archive

- **Tabs/tables:** Closed Projects (type, PMs, dates, final headcount, doc link); Declined/Dead-End Intake (flagger/reason/date/status); Auto-Expired Assignments (SPM/expiry/outcome); Suspended/Removed Accounts (threshold 30/60/90 days, pending review and historical removal).
- **Authority/actions:** Admin tab switching. View read-only, Confirm & Archive, Reinstate controls rendered but lack handlers. Share archive excluded.
- **Declared dependencies:** closeout deliverables approved; 30 days without intake revival; expired assignment's replacement resolved; human review for permanent account removal.
- **Functions/status:** `switchArchiveTab` works; archive rows and lifecycle automation are **Static/Unverified**. No verified manual archive mutation, restore, delete, or retention engine. No archive activity events.

### A15. Settings

- **Display/actions:** shared drawer; Admin Rules plus all-role personal Preferences/account summary. Each changed rule has Confirm Change/Cancel and browser confirmation. Change Password disabled.
- **Rules:** license grace 7 days (integer ≥0); max active projects per assignee 2 (integer ≥1); SPM response hard ceiling 3 business days (integer ≥1); idle timeout 15 minutes (integer ≥1); idle warning 60 seconds fixed. Share expiry excluded.
- **Dependencies:** grace rerenders license warnings; cap only refreshes OPM KPI warning, not allocation enforcement; response-window changes do not recompute existing deadline objects; timeout resets timer.
- **Functions/status:** Implemented/demo; in-memory, personal mute set not per-account persistent. `openSettingsPanel`, `renderSettingsPanel`, `onRuleFieldChanged`, `confirmRuleChange`, `cancelRuleChange`, `RULE_FIELD_CONFIG`, `toggleNotifMute`, close helper. Rule confirmation lacks explicit Admin guard beyond Admin-only rendering. No rule-change event.

## 4. Office PM module inventory

### O01. Dashboard / Upcoming Deadlines / Active Sites / Schedule

- **Display:** active project count/cap warning, pending confirmations, upcoming action count, total handled; deadlines chart; monitoring table; synthetic schedules.
- **Authority/actions:** OPM view, View Details, Request Update. Handler only requires role, not OPM-of-record ownership.
- **Inputs/rules:** deadlines derive from all pending intake and pending rework records. Reassignment red; other intake amber; rework red after 3 calendar days. These are urgency indicators, not a verified intake/rework expiration policy. No click-through chart actions.
- **Functions/status:** Partial scoping/static KPIs. `renderCapWarning`, `renderUpcomingDeadlines`, `renderActiveSitesMonitor(..., true)`, `requestSiteUpdate`.
- **State/events/relations:** request sets `{date, by}` on site, emits request to SPM/activesites, button feedback. Submission clears request. Related progress/rework/confirmation.

### O02. Assignment Confirmations / Site PM Team panel

- **Display:** type/size/floors, project, score, suggested OPM/SPMs, headcount, phase-team snapshot; pending/accepted/changes requested/reassignment notes.
- **Actions:** View Site PM Team, swap suggested SPM (fixed candidate list), Accept & Notify Site PM, Request Changes, Resume Document Upload.
- **Authority/validation:** acceptance/change require OPM and pending state, **not matching assigned OPM**. `changeSuggestedSpm` itself lacks role/state guard and updates flat suggestion, not authoritative phase roster.
- **State:** pending → accepted with resolution date. Featured item reveals Admin contract, six-doc checklist, SPM assignment. Changes requested → `changes_requested`, excludes prior OPM, 24h cooldown, Admin resubmit. `confirmed` means all SPM phase rows accepted, not active project.
- **Functions/status:** Partial. `renderOPMConfirmQueue`, `acceptOPMConfirmation`, `requestOPMChanges`, `changeSuggestedSpm`, `openSpmTeamDrawer`, `closeSpmTeamDrawer`.
- **Events/relations:** OPM confirmation → Admin intake; changes request → Admin intake; reassignment row if prior decline. Success modal immediately provides Later / Continue to Document Upload; `showOpmAcceptedNextModal`, `closeOpmAcceptedNextModal`, `continueOpmAcceptedToDocuments`. Full downstream wiring only item 1.

### O03. Contract Agreement

- **Display/actions:** Admin-provided signed client contract; OPM View/Download only after acceptance.
- **Inputs/rules:** actual `adminContractFile` required; absent file alerts. No replacement by OPM; download/view helpers lack independent role/ownership checks.
- **Functions/status:** Implemented/demo actual local file blob. `viewAdminContract`, `downloadAdminContract`.
- **Events/relations:** no explicit event; related intake contract, Documents workspace.

### O04. Registered Project Documents

- **Display:** six required items, selected/uploaded status, completion meter; seventh subcontractor agreement shown as Site PM-owned status.
- **Authority/actions:** OPM selects/preview-confirms six files; cannot upload seventh.
- **Validation/state:** document preset; `docUnlockReady()` = OPM accepted; duplicate uploaded button prevented; confirmation increments `uploadedDocs`. Six complete reveals SPM acceptance and starts assignment deadline.
- **Functions/status:** Partial. `handleDocFileChosen`, `markDocUploaded`, `docUnlockReady`, `tryUnlockAldenDocuments`, `confirmDocumentUpload('opmDoc')`, `updateDocProgress`.
- **Events/relations:** all-six complete → approval event to SPM/assignment. Sixth upload commits before missing deadline DOM access can throw; see limitations. Actual files stored on `window.opmDocumentFiles`, while repo reads DOM metadata.

### O05. Document Repository

- **Display/actions:** own-project folders, seven registered items, View/Download/Download All. No direct repository upload.
- **Authority/rules:** `getProjectsForOpm` filters by Office PM engineer name; `renderOpmDocRepo` requires OPM. Download helpers do not independently scope.
- **Functions/status:** Implemented/demo scoped repository; placeholder files. `getProjectsForOpm`, `toggleOpmDocRepoFolder`, `opmDocRepoFolderHtml`, `renderOpmDocRepo`.
- **Events/relations:** shared preview view event. Related Admin repository and Documents upload.

### O06. Rework / Issue Approvals

- **Display/actions:** all pending site issues, stage/current percentage, SPM note, proposed stage-floor rollback; Approve Rework, Decline — No Change; demo concurrent resolution.
- **Authority/rules:** OPM-only, expected-version check; no assigned-OPM check. Never auto-approved. No mandatory rejection explanation.
- **State:** approve sets percentage to `min(previousPct, stageFloor)`, adds client-visible resolved history, clears pending rework. Decline retains percentage, records resolution, clears pending. Stage unchanged.
- **Floors:** Mobilization 0, Design 15, Foundation 30, Structure 50, MEP Rough-in 68, Finishes 85, Closeout 100.
- **Functions/status:** Implemented/demo with model conflict risk. `renderReworkQueue`, `approveRework`, `declineRework`, `simulateReworkConflict`, `systemPctForStage`.
- **Events/relations:** approval/rework declined → OPM/reworkqueue. Checklist approvals remain separate; rollback does not reset approved checklist items/baseline, so later recalculation may undo it.

### O07. Progress Update Approvals

- **Display/actions:** pending update note/date/evidence metadata and review/escalation state; Approve; demo elapsed-window simulation. No verified reject action.
- **Authority/rules:** OPM role/version check, no project ownership guard. Three calendar days: unchanged-stage/% informational update auto-approves; material change escalates once and stays pending.
- **State:** `applyPendingUpdate` appends client-visible history and clears pending; **does not change stage/percentage**, despite stale material-update commentary.
- **Functions/status:** Partial. `renderUpdateQueue`, `approveUpdateNow`, `isMaterialUpdate`, `daysUntilAutoApprove`, status helpers, `checkPendingUpdateAutoApprovals`, `simulateUpdateAutoApprove`, `applyPendingUpdate`.
- **Events/relations:** manual approval, auto-approval, escalation → OPM/reworkqueue. Admin banner exists, but Admin cannot use OPM-only approval guard. Current submission path produces same-stage/% updates; ordinary UI creation of material updates is Unverified.

### O08. Activity Checklist (QA/QC) Approvals

- **Display/actions:** submitted evidence grouped by site/current stage; date/file link/missing-file warning/escalation; Approve/Reject each.
- **Authority/rules:** OPM-only; submitted status required; no assigned-OPM check, version parameter, mandatory file check, or rejection reason field in handler. No auto-approval; escalation after three calendar days.
- **State:** approved → recomputed percentage; rejection → `missing` with fixed correction note and cleared review timer. Final required approval can advance current phase if next named assignee confirmed and no pending rework.
- **Functions/status:** Implemented/demo with guard gaps. `renderChecklistQueue`, `approveChecklistDoc`, `rejectChecklistDoc`, `checkChecklistEscalations`, `recalculateChecklistProgressPct`, `autoAdvanceIfChecklistComplete`.
- **Events/relations:** approved/rejected/escalated, next-phase advancement and notice. Related SPM checklist, client status, phase handoff.

### O09. Site PM Response Tracking / Archive

- **Display/actions:** Project, Site PM, Response, Note; rows prepended on responses/reassignments. Archive tabs: Completed & Accepted Projects; Changes-Requested History; Past SPM Response Outcomes.
- **Authority/rules:** OPM view; no verified assigned-OPM row filter. Archive copy promises automatic movement after accepted/full documents, resolved changes, terminal response.
- **Functions/status:** `addSpmResponseRow`, `switchArchiveTab` implemented; archive data/transfers/view-doc buttons **Static/Unverified**. Response table is DOM, not durable event records.
- **Events/relations:** underlying assignment handlers emit events, tab switching does not. Related intake/reassignment.

## 5. Site PM module inventory

### S01. Dashboard / Schedule Performance

- **Display:** total handled, rework flags, active sites; synthetic planned/actual charts. Some values literal or all-site totals rather than current-account metrics.
- **Authority/actions:** Site PM view, shared navigation.
- **Status/functions:** mixed static/Implemented/demo; shared schedule engine, `renderActiveSites`. No explicit dashboard event.

### S02. Assignment Request / phase responsibilities

- **Display:** featured project metadata/match/headcount/start, full phase team and status; lead embedded rows, nonlead separate phase cards; waiting/current/completed states.
- **Authority/actions:** only Mobilization owner is project-specific Lead. Own pending rows Accept/Decline; others display-only. Lead accepts featured Mobilization first; nonlead acceptance confirms all that person's pending featured-project phases at once.
- **Rules/state:** OPM accepted and all six docs required at acceptance-handler level; nonlead acceptance additionally requires lead confirmed. UI can show actionable buttons before six docs, causing guarded no-op. `declineMyPhase` lacks the lead-first guard used for acceptance; clears name, sets declined. Reassignment requires Admin/OPM and nonconfirmed row.
- **Functions/status:** Partial. `isLeadSpmForAlden`, `renderAssignmentGate`, `myPhaseRows`, `renderMyPhaseAssignments`, `phaseTeamEmbeddedHtml`, `leadAssignmentIsConfirmed`, `acceptAssignment`, `acceptMyPhase`, `declineMyPhase`, `pendingTeamPhaseRows`, `aldenTeamFullyConfirmed`, `refreshAldenAssignmentWorkflow`.
- **Events/relations:** lead accepted, phase confirmed, all SPMs confirmed, phase declined; routed roles vary (see event inventory). Accepted phase cannot be quick-reassigned. Related subcontractor unlock, handoff, OPM response tracking.

### S03. Decline form / deadlines / conflict handling

- **Intended display/input:** lead decline reason form, cancel/confirm, response deadline badge, demo expiry/concurrent reassignment.
- **Rules:** lead reason required; generic phase decline does not request reason. Assignment soft target one business day; hard ceiling configured, default three business days. Weekends excluded, holidays not modeled.
- **State:** hard expiry routes intake to pending with `declinedInfo.autoExpired`, adds nonresponsive response, shows Admin banner, resets document/assignment state. Decline similarly returns OPM queue and resets.
- **Functions/status:** **Partial/broken wiring:** deadline/decline DOM elements are absent; unguarded dereferences in `startAssignmentDeadline`, `stopAssignmentDeadline`, `showDeclineNote`, reset path. `subconUploadBtn` is undeclared. `acceptAssignment` sets row confirmed before calling broken stop function; later refresh/log can fail.
- **Functions:** `addBusinessDays`, `businessDaysRemaining`, `formatDeadlineDate`, deadline start/stop/render/expire/simulate; decline show/cancel/confirm/reset; `simulateAssignmentConflict`, `showConflictBanner`.
- **Events:** lead decline emits request to SPM; deadline expiry has response/banner but no explicit log event. Real per-assignee deadlines beyond featured lead are Unverified.

### S04. Active Sites / Completed Phase / Recommended Disciplines

- **Display:** Project, Phase, Crew, Progress, Action; current stage/system percentage/date, pending issue/update/request, owner/handoff, checklist count.
- **Actions:** View Details; current-owner Upload Progress; View Completed Phase for prior owner; show recommended engineer/subcontractor disciplines; expand history.
- **Rules:** actual table iterates all sites, despite “Your” wording. Current owner gates submission; future owner intended to wait, past owner gets readonly record. No general site filtering. Unowned phase is treated permissively by several checks.
- **State:** active panel ID preserves expanded panel on rerender; issue selections reset on rebuilding forms. Completed phase panel lists approved checklist and handoff.
- **Functions/status:** Partial scoping. `renderActiveSites`, `toggleProgressPanel`, `toggleCompletedPhasePanel`, `focusProgressPanel`, `toggleDiscRef`, `phaseDisciplinesHtml`, `renderHistoryEntries`.
- **Events/relations:** phase activation notices may arise during rendering. Discipline guide is reference only, not a workforce requirement gate.

### S05. Progress submission / issue reporting / general field evidence

- **Inputs:** current phase readonly, system percentage readonly, optional PDF/image report/photo, issue chips, optional notes; Other requires explanation.
- **Issue categories:** Failed inspection; Material defect / damage; Rework required; Design / plan change; Weather delay; Subcontractor manpower shortage; Safety incident; Other.
- **Actions/rules:** current phase owner submits; normal pending update blocks another normal note but allows checklist evidence and issue path. No minimum content requirement for normal note; no required file. Issue creates pending rework rather than silently changing stage/%.
- **State:** confirmed field evidence stores name/type/blob URL. Normal update stores same stage/% and evidence fields, hidden pending history; issue stores pending rework/version 1 and hidden history. Both clear update request. Pending rework UI replaces normal progress form with locked review/history.
- **Validation gap:** `handleSiteEvidenceSelected` and confirm path do not call document upload preset; HTML accept is not actual size/type validation.
- **Functions/status:** Implemented/demo with validation gaps. `toggleIssuePanel`, `toggleIssueChip`, `issueChipListHtml`, `handleSiteEvidenceSelected`, `confirmDocumentUpload('siteEvidence')`, `submitProgress`, `updateSysPct` (legacy helper).
- **Events:** progress flagged → SPM/activesites; normal progress submitted → OPM/reworkqueue. No explicit event on attaching general evidence alone.

### S06. Phase checklist evidence

- **Display/actions:** each current-stage requirement with missing/submitted/approved state, rejection note, upload control; preview Back/Retry/Confirm.
- **Authority/rules:** assigned current phase owner, current stage match, item not approved. Confirmation stores file metadata/blob URL and submits to QA/QC; file selection alone does not submit. Legacy `submitChecklistDoc` can submit without file/current-stage equality guard.
- **Validation gap:** `handleChecklistFileSelected`/confirm lack document preset enforcement; must preserve confirmed preset in rebuild, not this omission.
- **State:** missing → selected local file → confirmed submitted → approved, or rejected back to missing; resubmission clears note/escalation.
- **Functions/status:** Implemented/demo with guard gaps. `getStageChecklist`, `checklistHtml`, `handleChecklistFileSelected`, checklist confirmation helpers, `submitChecklistDoc`, `isStageChecklistComplete`, `checklistProgressCounts`.
- **Events/relations:** legacy activity document submitted and confirmed activity evidence submitted → SPM/activesites. Related O08, C03; exact requirements in §9.

### S07. Subcontractor allocation / outreach / response

- **Display:** matched candidates and team, effective match/certification coverage, double-booked status, workers, acceptance/decline/contact timestamps; client-provided locked company.
- **Authority:** project Lead intended; contact/manual response explicitly check SPM and Mobilization owner, docs/team prerequisites. Add/remove/swap/worker helpers lack equivalent role/lead checks.
- **Actions:** select suggested/company from directory; Add to Team; swap/remove unconfirmed; Try to Contact Subcon; manually Accept/Decline; expand/edit crew; request new company.
- **Matching:** pre-add only highest-ranked non-double-booked suggestion. Score 70% base match + 30% full-certification coverage. Double-booked demoted and excluded from automatic top pick but still manually selectable. Date comparison hard-coded incoming start 2026-08-15. Location/scope claims do not establish real matching.
- **Rules:** all six docs + entire SPM team confirmed unlock matching (2.6-second simulated delay). Contact creates `consentStatus='invited'` meaning contact recorded, **sends no email**. Only invited can be manually confirmed/declined. Confirmed cannot swap/remove; declined removed from team and can replace.
- **Consent gate limitation:** nonempty, non-Admin-pending current team must all be confirmed. Pending requests are ignored, no required-trade matrix/minimum crew coverage enforced. Client-provided company separate from that gate.
- **Functions/status:** Partial. `rankSubcons`, `isSubconDoubleBooked`, `subconCertCoverage`, `subconEffectiveScore`, `getRequiredCertifications`, `renderSubconPanel`, `renderSubconOutreachList`, `addManualSubcon`, `addManualSubconById`, `swapSubcon`, `contactSubconByEmail`, `simulateSubconResponse`, `consentStatusHtml`, `teamConsentComplete`.
- **Events/relations:** contact attempt, manual acceptance/decline → SPM/assignment. Accepted lock is handler-enforced. Client-provided lock separate, not removable from normal team selector.

### S08. Worker editing / Add Headcount

- **Display/inputs:** crew name, role, phone, discipline, active/inactive; system-added/imported/pending-cert flags.
- **Actions:** expand crew, edit/save/cancel, + Add Headcount; no remove-worker action. Client-provided roster UI readonly.
- **Rules:** save requires nonblank name; blank role/phone retain previous values. Other field validity not verified. Headcount consumes queued Excel records one-by-one, then generates synthetic worker names/roles/phones.
- **State:** generated worker has DOLE-Safety marked pending verification, no license/history. Certification scoring checks certification strings, not pending-verification status. Role/lead/locked-company enforcement missing inside helpers.
- **Functions/status:** Partial/demo. `getWorkerList`, `workersPanelHtml`, `workerRowHtml`, `toggleSubconWorkers`, `editWorker`, `saveWorkerEdit`, `cancelWorkerEdit`, `addWorker`.
- **Events/relations:** no explicit worker-edit/headcount activity. “Contact Admin for corrections” has no verified Admin worker removal flow.

### S09. New Company request / Excel import

- **Locations:** Assignment Request and standalone Subcon Directory, independent form state.
- **Inputs/actions:** company name/trade required; optional contact person/number; optional XLSX/XLS roster; Submit for Admin Approval, Cancel, Withdraw pending request.
- **Validation:** spreadsheet preset; XLSX library must load; first worksheet only; header row case-insensitive. Required Name/Worker/Full Name; Role/Position; Phone/Contact/Contact Number; Discipline; Certifications/Certification/Certs. Missing-name rows skipped. Empty/malformed/library failure messages. Cert delimiters comma/semicolon/slash.
- **State:** contact optionally becomes first worker; imported workers held in `excelQueue`, not all committed immediately. New request marked pending/version 1, added to team but excluded from confirmed count. Submitter/project hard-coded even from directory. Cancel resets staged import; no duplicate-company validation verified.
- **Functions/status:** Implemented/demo, actual client-side XLSX parse. `NEW_SUBCON_FORM_IDS`, `toggleNewSubconForm`, `resetNewSubconUpload`, `parseExcelCertifications`, `handleNewSubconExcelUpload`, `submitNewSubconRequest`, `withdrawPendingSubcon`.
- **Events:** new request → SPM/assignment, not Admin queue recipient. Withdraw no event. Approval required for directory reuse, then separate consent still needed.

### S10. Signed Site PM–Subcontractor Agreement / activation

- **Inputs/actions:** signed agreement file, confirmation; final assignment-complete modal Dismiss/View Active Sites.
- **Authority/rules:** Lead-only requirement approved; handler only verifies SPM role, all intake readiness/consent, not Lead identity. Document preset at file selection; no duplicate submit after uploaded.
- **State:** stores file, updates SPM and OPM seventh row, runs activation through progress refresh. Final activation checks OPM accepted, all six docs, all SPM rows confirmed, nonempty confirmed team, signed agreement, resolvable/activatable client.
- **Functions/status:** Partial. `handleSubconAgreementFileChosen`, `uploadSubconAgreement`, `confirmDocumentUpload('subconAgreement')`, `updateDocProgress`, `addAldenToActiveSites`, `activateClientAccessAfterFullWorkflow`.
- **Events/relations:** Project activated → Admin; new client activated → Admin account event. No standalone agreement-upload log. UI can say Project Started and show success before proving client activation succeeded; modal is assignment completion, **not construction closeout**.

### S11. Document Repository / Subcontractor Directory / Archive

- **Repository:** scoped with `isSpmOnSite`; agreement status and watermarked view-only preview, no download; current checklist status. Does not expose OPM permits/contracts/budget. `renderSpmDocRepo`; preview view event.
- **Directory:** same company/worker filtering and CSV as A12; new company form as S09.
- **Archive:** Completed Projects; Subcontractor Request History; Declined Assignment Requests. Static tables; view buttons unwired. `switchArchiveTab` only verified action; automatic historical movement Unverified.

## 6. Client module inventory

### C01. Project Overview

- **Display:** featured Alden project name, phase, percentage/on-schedule label, OPM and Site PM primary contacts, simplified Design/Construction/Closeout timeline.
- **Authority/actions:** client read-only, opens project monitoring via hard-coded site ID 4.
- **Inputs/rules/state:** no project selector verified; overview is static, not filtered by account scope or synchronized to activation. `renderClientProjectOverview` is referenced behind `typeof` check but not defined.
- **Status:** Partial/static; before activation `findSite(4)` cannot resolve active record so button returns without detail. No explicit overview event.

### C02. Read-only monitoring / photos / phase timeline / schedules

- **Display:** shared project-detail KPI row (including crew count/status), photo gallery with arrows/dots/captions/date/uploader, seven-stage readonly timeline, synthetic schedules.
- **Authority/actions:** restricted branch hides personnel sections, internal diary, rework detail, edit/upload controls. Gallery navigation only.
- **Rules/gaps:** `openProjectDetail` does not verify logged-in client, account scope, or project linkage. Client can call it for any resolvable active-site ID. Readonly is presentation, not secure access.
- **Functions/status:** Partial. `buildProjectDetailHtml(...restricted)`, gallery/stepper helpers, `openProjectDetail`, `closeProjectDetail`.
- **Events/relations:** no project-open event. Related C03–C05.

### C03. Approved Progress History / Activity Checklist status

- **Display/actions:** toggle history (date, stage, percentage, note), toggle current checklist labels and status (not submitted/under review/approved); no evidence upload/approval.
- **Rules:** history excludes only `clientVisible:false`; seed/default/resolved entries visible by default. Checklist hides rejection explanation/escalation details, not the fact of review.
- **Functions/status:** Implemented/demo with default-visibility risk. `clientVisibleHistory`, `clientHistoryEntriesHtml`, `toggleClientHistoryList`, `clientChecklistRowHtml`, `clientChecklistHtml`, `toggleClientChecklist`.
- **Events/relations:** no explicit toggle event. Resolved rework notes can enter visible history despite hiding internal rework section; wording/content policy requires care.

### C04. Client-visible Project Documents

- **Display/actions:** toggle individual permitted records; uploaded-only View/Download buttons; missing status.
- **Rules:** whitelist IDs 1,2,4,5 only; IDs 3,6,7 internal; unknown fail closed. No own-account/project scope enforcement in underlying helpers.
- **Functions/status:** Implemented/demo filtered records, watermarked simulated previews/text downloads. `REPO_DOC_CLIENT_VISIBLE`, `isDocClientVisible`, `clientVisibleDocItems`, `clientDocRepoRowHtml`, `clientDocRepoHtml`, `toggleClientDocRepo`.
- **Events/relations:** shared `view` event; no explicit download event. Do not expose employment, engagement, budget, internal contracts, or full QA/QC evidence by inference.

### C05. Authorized Progress Report

- **Display/actions:** Download Progress Report; current project/stage/% and approved history.
- **Rules:** pending/unreviewed entries excluded; `.txt` prototype export, not PDF. Download function does not independently verify client project scope.
- **Functions/status:** Implemented/demo. `buildClientProgressReportText`, `downloadClientProgressReport`.
- **Events/relations:** no explicit export event; no real report-generation service.

### C06. Client activation / restrictions

- **Rules:** new-client draft held until full setup; existing client scope not expanded at intake. Final gate resolves client; suspended existing client prevents activation. New draft becomes active with this project's scope. Legacy seed exception permits already-active matching client.
- **State:** pending setup → active at gate; queue `clientActivationPending=false`; timestamp; pending success notice.
- **Functions/status:** Partial. `activateClientAccessAfterFullWorkflow`, `showClientActivatedModal`, `closeClientActivatedModal`; `viewClientPortalAfterActivation` helper exists without visible matching CTA.
- **Events:** new account activated account event; existing scope link no equivalent explicit event. No verified credential-delivery mechanism. No client writes, accept/decline, approvals, or uploads authorized.

## 7. Shared system, secondary surfaces, and CSS behavior

| Component | Information / input / actions | Rules, functions, state, events, status |
|---|---|---|
| Login | email/password; Log In or Enter; demo autofill for five identities across four roles | `attemptLogin`, `fillDemoLogin`; account/password match; blocks pending setup/activation, invited, suspended, OPM/SPM beyond license grace. Login event. Simulated plaintext in-memory accounts; invited activation missing. |
| Suspended-account Notify Admin | shown only after valid suspended-account credentials; notification confirmation | `notifyAdminAboutAccount`; UI-only feedback, no service or activity event. |
| Session shell | current user/role/email, logout, Admin view-as | `enterApp`, `logoutSession`, `switchView`; nonadmins role-switch button listener blocked. Internal `switchView` not a security boundary. Logout event, clears timers/login inputs. Re-render scoping incomplete after user switch. |
| Idle warning modal | countdown, Sign out now, Stay signed in | `resetIdleTimer`, `showIdleWarning`, `stayLoggedIn`, `idleLogoutNow`, `clearIdleTimers`; default 15m/60s; mouse/key/touch/scroll/click resets; logout event only. No server expiry. |
| Notification dropdown | most recent 10 request/approval/progress/notice entries, unread count max display 99+, Mark all read, full log link | `renderNotifPanel`, `updateNotifBadge`, `toggleNotifPanel`, `markAllNotifsRead`; outside click closes; mute types removed; global log, not recipient-scoped. |
| Activity Log drawer | title/detail/actor/role/time/context link; All/Requests/Approvals/Progress/Account/Login-Logout filters | `seedActivity`, `logActivity`, `renderActivityList`, `setActivityFilter`, open/close; all-role feed; no notice/view/system dedicated filters but included in All; timestamps refresh every minute while open. |
| Activity contextual routing | click row marks read then opens originating context | `goToActivityTarget`; nonadmin wrong-target role alerts, Admin can switch view; invalid/stale anchors possible. Does not prevent seeing cross-role feed data. |
| Settings drawer | personal notification type checkboxes/account summary; Admin Rules | §A15; shared in-memory mute set, no persistent personal profile. Change Password disabled. |
| Account panel | view/edit identity/scope/status; close/backdrop | §A13; rendered as centered modal by CSS. |
| Site PM Team drawer | project/type/size/floors, phase assignee/match or flat fallback | `openSpmTeamDrawer`, close; read-only snapshot, no event. |
| Project detail overlay/modal | role-specific photos, KPIs, timeline, schedule; internal personnel/reference/rework/diary or client report/history/docs | `buildProjectDetailHtml`, §A02/S04/C02; Admin/OPM phase reassignment exception. Backdrop closes. |
| Internal diary | note text, date/author; Add Note for SPM | `pdAddNote`, `pdNotesHtml`; requires role/nonblank text, not phase/site ownership; no activity event. |
| Site photo gallery | arrows/dots, caption/date/uploader; SPM Upload Site Photo | `pdGalleryHtml`, `pdChangePhoto`, `pdGoToPhoto`, `pdAddPhoto`; “upload” inserts remote Picsum image, no file picker/storage/preset; role only, no site ownership; no activity event. |
| Phase reassignment selector | unconfirmed phase candidates | `phaseTeamStatusHtml`, `reassignPhaseSpm`; Admin/OPM role; confirmed locked; helper accepts any found account ID without validating SPM eligibility/project ownership. Reassignment account event to SPM. |
| Document preview modal | document/project/status, viewer/time repeated watermark; optional Download, Close | `openDocPreview`, `closeDocPreview`, `downloadDocPreviewFile`; simulated record, not actual PDF contents; session required; downloadable flag trusted from caller; view event. Watermark not access security. |
| Document confirmation | image or embedded PDF first page, filename; Back/Retry Upload/Confirm Upload | `ensureDocumentUploadConfirmModal`, `buildUploadPreviewMarkup`, open/close/back/retry/confirm helpers; pending object, no upload until Confirm. Retry wiring broken as described §13. |
| Checklist confirmation | evidence preview + target requirement; Back/Retry/Confirm | checklist confirmation helpers; correct pending input storage; current owner/current stage rechecked; submitted event on confirm. |
| License add / renewal confirmation | license metadata/file; Save/Cancel, Confirm Update/Cancel | §A11; renewal filename confirmation rather than full shared preview. |
| Intake/resubmit/client modals | §A04–A07 | backdrop and Escape close implemented for several, not uniformly. |
| Project Creation Complete modal | project sent / next Office PM step; Done | `showProjectSentModal`, close; successful intake only, not activation. |
| Office PM Assignment Confirmed modal | project, six-doc progress, Later / Continue to Document Upload | §O02; immediate acceptance feedback. |
| Project Assignment Completed modal | project + Dismiss/View Active Sites | show/close/go-to helpers; closes then queues activation notice. Not construction completion. |
| Client Account/Project Access Activated modal | project/client/full internal workflow completed; Done | show/close helpers; new account vs existing link wording; no real delivery service. |
| Escalation banners | assignment nonresponse, material update, QA/QC overdue; dismiss | three show helpers reuse single Admin banner, later event can overwrite earlier visible alert; no durable escalation queue. |
| License alert banner | expired/expiring staff summary, Review | `renderLicenseAlertBanner`; links engineer directory. |
| Conflict banner | “Update conflict” explanation, auto-disappears after 7s | `showConflictBanner`; versions for request/rework/update; demo mutation buttons not real concurrent sessions. |
| Shared primitive patterns | cards, stepper, badges, status pills, counters/progress tracks, searchable/filterable lists, tables, accordion folders/rosters, empty/error/success states, disabled/locked actions | CSS `.view.active`, section hiding, `.open`/`.is-open`, active archive panel/tab, expanded groups; semantic behavior must survive, visual styling must not be copied. |

CSS contains responsive changes around 980px (grids/charts), 900px (intake/other layout), 760px (progress/checklists), 640px (personnel). Fixed sidebar and many 10–13px labels do not meet approved daylight mobile/14px-minimum requirements. Modal layers, sticky/scrolling regions, disabled affordances, open/closed states, and preview overlays are functional concerns; old fonts/colors/shapes/background grid are not to be reproduced. Consistent keyboard focus trap, focus restoration, accessible live announcements, comprehensive mobile navigation, and escape handling for every surface are **Unverified**.

## 8. Permission matrix

These are verified exposed role capabilities, not proof every handler enforces them. Scope/guard exceptions are explicit below. A = Administrator, O = Office PM, S = Site PM, L = project Lead SPM, C = Client.

| Capability | A | O | S / L | C |
|---|---|---|---|---|
| View | organization/project/account/directory data | operational views; own-project repo | assignments/sites, directory; restricted own-site repo | linked-project intent; actual scope guard missing |
| Create | intake, account, intake client draft | no general create project/account | new-company requests, notes/issues/evidence | no |
| Edit | accounts/settings/intake lineup | suggested SPM; unconfirmed phase reassignment | crew/diary and own-phase submissions | no |
| Upload | intake contracts, license, employment, engagement | six registered docs | own-phase evidence/checklists; L agreement | no |
| Download | registered records, actual local contracts, CSV | managed-project records and Admin contract | CSV; submitted-agreement preview has no download | whitelist docs + approved report |
| Accept | not OPM/SPM acceptance | own-role intake acceptance, project guard absent | own assignments; L first | no |
| Decline | not SPM response | Request Changes, rework decline | own phase; lead decline reason intended | no |
| Approve | new companies; Admin escalation resolution not wired | rework, progress, QA/QC | record subcontractor Accept is not Admin approval | no |
| Reject | new companies | QA/QC; rework decline; no progress rejection verified | record subcontractor Decline | no |
| Archive | archive view; manual controls static | archive view only | archive view only | no module |
| Manage accounts | yes | no | no | no |
| Manage assignments | initial/resubmit; unconfirmed phase reassignment | suggested SPM, unconfirmed phase reassignment | accept/decline own responsibility only | no |
| Manage subcontractors | approve/reject requests, directory oversight | no dedicated management | L coordination; S request new company | no |
| Submit progress | no | no | current phase owner | no |
| Review progress | monitoring; escalations visible | approve/rework/QA-QC | own history/status, no review approval | approved readonly history |
| Company rules | yes | no | no | no |
| Personal notification preferences | yes | yes | yes | yes |

### Ownership must be separate from role

1. Lead = site's Mobilization assignee, not a fifth global role.
2. Current phase owner resolves `phaseTeam` or single Site PM engineer; current owner required by progress/evidence handlers.
3. Any assigned SPM qualifies for scoped agreement-status repo via `isSpmOnSite`.
4. Office PM-of-record used in repository filtering, **not enforced** by most confirmation/review/reassignment handlers.
5. Confirmed phase locked against quick reassignment. Accepted subcontractor locked against swap/remove.
6. Contact/response has explicit featured Lead checks; agreement/crew/add/swap paths inconsistent.
7. Client project scope exists in account data but is not enforced by detail/report/download entry points.
8. Admin view-as does not convert actual session into another role; OPM/SPM-only mutation guards reject Admin.
9. Shared activity/notification rendering does not filter role recipients or project scope.

## 9. Document requirements and repository rules

### Upload presets

- `document`: `.pdf`, `.jpg`, `.jpeg`, `.png`; maximum **10 × 1024 × 1024 bytes**, equality accepted.
- `spreadsheet`: `.xlsx`, `.xls`; maximum **15 × 1024 × 1024 bytes**, equality accepted.
- Missing file, disallowed extension, oversize rejected by `validateUpload`; extension comparison case-insensitive.
- Zero-byte rejection, MIME/content verification, malware scan, server validation are not implemented.

| Category / form | Uploader | Required/gate | Preview/storage/access |
|---|---|---|---|
| Client Contract Agreement | Admin | intake send | document preset; shared confirmation; local File; locks after upload/send; OPM view/download after accept |
| Client & Subcontractor Agreement | Admin | conditional client-own-subcontractor toggle | document preset; shared confirmation; local File; company details locked after send; client company cannot remove |
| 1 Notice to Proceed | OPM | one of six, all mandatory | document preset; shared confirmation; client-visible |
| 2 Approved Building Permit | OPM | one of six | same; client-visible |
| 3 Signed Owner-Contractor Agreement | OPM | one of six | same; internal only |
| 4 Structural & Architectural Plans (Registered) | OPM | one of six | same; client-visible |
| 5 Environmental Compliance Certificate | OPM | one of six | same; client-visible |
| 6 Project Budget & Bill of Quantities | OPM | one of six | same; internal only |
| 7 Site PM–Subcontractor Agreement | Lead intended | final activation prerequisite | document preset; shared confirmation; local File; internal; SPM watermarked view-only |
| First engineer PRC license | Admin | credential record, not intake gate | document preset; metadata/file required; file name retained, not actual durable file |
| Renewal license | Admin | resolves license/grace block | document preset; dedicated confirm/cancel; filename/renewed flag; no new expiry |
| Employment contract | Admin | company-wide per engineer; no activation gate verified | document preset; shared confirm; local File view/download |
| Engineer engagement agreement | Admin | per project, assigned OPM/SPM; no activation gate verified | document preset; shared confirm; local File view/download |
| General photo/report evidence | current SPM | optional progress support | HTML document accept only; preset missing; shared confirm; blob URL |
| Stage QA/QC evidence | current SPM | approval gate per item | HTML document accept only; preset missing; dedicated confirm; metadata/blob URL |
| New-company worker roster, both forms | SPM | optional | spreadsheet preset; immediate client parse, no shared confirmation; queued workers |
| Project-detail “Upload Site Photo” | SPM | optional | not a real upload: remote generated picture; no file validation |
| Progress report | client readonly export | approved history only | generated `.txt`, no PDF pipeline |
| Directory crew export | Admin/SPM | none | generated synthetic CSV, not stored crew |

### Exact phase checklist templates (`STAGE_CHECKLISTS`, 9875–9912)

| Stage | Required evidence |
|---|---|
| Mobilization | Work Permits / Site Mobilization Clearance; Approved Drawings and Specifications (site layout); Activity/Work Inspection Checklist (site setup) |
| Design | Approved Drawings and Specifications; Quality Control/QA-QC Checklist (design review); Previous Activity Acceptance/Clearance (Mobilization) |
| Foundation | Activity/Work Inspection Checklist (excavation & formwork); Inspection and Testing Records (soil compaction / rebar); Method Statement (concrete pour); Previous Activity Acceptance/Clearance (Design) |
| Structure | Activity/Work Inspection Checklist (rebar & formwork per level); Inspection and Testing Records (concrete cylinder tests); Method Statement (structural pour/lifting); Quality Control/QA-QC Checklist; Previous Activity Acceptance/Clearance (Foundation) |
| MEP Rough-in | Activity/Work Inspection Checklist (rough-in); Inspection and Testing Records (pressure/insulation resistance tests); Work Permits or Clearances (electrical/fire); Previous Activity Acceptance/Clearance (Structure) |
| Finishes | Activity/Work Inspection Checklist; Quality Control/QA-QC Checklist; Previous Activity Acceptance/Clearance (MEP Rough-in) |
| Closeout | Inspection and Testing Records (final systems testing); Work Permits or Clearances (occupancy/certificate of completion); Approved Drawings and Specifications (as-built); Previous Activity Acceptance/Clearance (Finishes) |

### Confirmation lifecycle

1. Select file → staged, selected-state feedback; no committed completion yet.
2. Preview image or first-page PDF object/iframe; unsupported preview gets generic label.
3. Back cancels pending confirmation; intended file clearing is inconsistently wired for shared document confirmation.
4. Retry should reopen correct chooser; checklist path stores input correctly; general document path stores input inside `meta` but reads `pending.input`, so it fails for current callers.
5. Confirm rechecks applicable role/state, commits item, locks completed intake doc, updates counts/dependent views. General confirm does not universally rerun file validation.
6. No actual async network upload/retry/progress/error pipeline. Local preview completion is not secure upload completion.
7. Preview blob cleanup incomplete: PDF object uses `data`, while cleanup checks `.src`; numerous stored blobs never revoked.

### Repository boundaries

- Admin project vs engineer repository remain distinct.
- OPM repository only own recorded projects; upload stays in registered-document workspace.
- SPM repository own assigned sites only, agreement status/readonly watermark and current checklist status, not OPM documents.
- Client whitelist only 1/2/4/5; unknown IDs private. Approval status does not itself make an internal document client-visible.
- Most registered previews/downloads use placeholder text records even when local files were selected. Do not claim they retrieve stored originals.

## 10. Validation inventory

| Area | Verified validation | Gaps / Unverified |
|---|---|---|
| Login | exact stored password/email match; case-insensitive trimmed email; blocked statuses; OPM/SPM license grace | no hashing/rate limit/reset/activation service; plaintext demo data |
| Generic account create/edit | name/email; case-insensitive uniqueness; SPM 1–3 canonical disciplines on edit; OPM 1–2 canonical types on edit; client creation needs project | generic email syntax not checked; password not stored; no contact format; partial failed edits |
| Intake client | regex email, required name/email, duplicate account role handling | suspended duplicate edge case; activation credential presentation |
| Intake | required text fields/type/client/contract; conditional company name/agreement | no positive numeric/date validation, eligible OPM/all phase assignments final gate, comprehensive duplicate project rule |
| Resubmit | selected OPM; exclusions/cooldown in option generation | no complete phase lineup validation; no eligible-candidate recheck at commit |
| Scope matching | finite discipline/type vocabularies, ranked coverage, active Lead exclusion | no minimum score, license check, active-only state, workload-cap enforcement |
| Uploads | preset size/extension in listed forms | evidence/checklist bypass preset; no file-content or zero-byte validation |
| First license | number, expiry, supporting file | no date recency/unique license checks |
| Company request | company/trade, spreadsheet preset | no company duplicate/contact validation; hard-coded submitter/project |
| Worker edit | name nonblank | no real phone/discipline/license verification; no trusted HR correction flow |
| Subcontractor response | SPM + Lead, full SPM/docs ready, invited response, accepted lock | pending requests ignored by consent gate; trade/headcount coverage not enforced |
| Agreement | SPM, ready intake/consent, one-time upload | missing Lead guard; success before verified client activation |
| Progress | current owner; Other note; normal update uniqueness | empty normal update accepted; missing owner permissive; issue may overwrite pending rework via direct handler |
| Checklist | current owner/stage in file path; item not approved; OPM submitted-state approval | preset/file-required/version/project-owner checks incomplete; legacy fileless submit path |
| Rework | OPM, expected version | no OPM project scope; stage rollback vs checklist progress conflict |
| Update approval | OPM/version, 3-day rule | no rejection; Admin resolution not wired; material-update creation not ordinary UI |
| Phase reassignment | Admin/OPM, account exists, row nonconfirmed | chosen account need not be eligible SPM inside handler; project scope missing |
| Rules | integer lower bounds; per-field confirm/cancel/browser confirmation | parser truncates decimals; no explicit role guard at mutation |
| Downloads/previews | item status hides buttons; client type whitelist in rendering | direct entrypoint role/project authorization absent |

Eight SPM disciplines: Civil, Geotechnical, Structural, Mechanical, Electrical, Plumbing, Fire Protection, Acoustic. Worker discipline list is separate: Structural, Electrical, Mechanical, Facade, Waterproofing, Fire & Life Safety, Civil, Renovation, General Labor. Worker discipline is not itself wired to matching gates.

Cert scoring: universal DOLE-Safety by project type; Structural/Rebar TESDA-Welding; Electrical PRC-Electrical; Mechanical/Plumbing PRC-Mechanical; Fire & Life Safety BFP-FireSafety; Facade/Waterproofing no extra mapped trade cert. Full worker coverage requires all mapped strings. It does not validate actual cert documents, expiry, or pending verification.

## 11. Workflow dependency matrix

| Transition | Actor | Required predecessor / inputs | Result / blocker | Source |
|---|---|---|---|---|
| Draft → sent | Admin | project fields/type/client, uploaded signed contract, optional client-subcon agreement | queue pending, snapshot, client access deferred, sent modal | `confirmAndSendToOPM` |
| Recommend people | system/Admin | project type/size, account tags/status, exclusions | OPM + SPM lineup/headcount; empty eligible pools not comprehensively blocked at final send | allocation helpers |
| Pending → OPM accepted | assigned OPM intended | pending item | success modal; uploads available immediately | `acceptOPMConfirmation`, `docUnlockReady` |
| Pending → changes requested | OPM | pending item | Admin resubmit; prior OPM permanent project exclusion + 24h global cooldown | `requestOPMChanges` |
| Changes → resubmitted | Admin | new eligible OPM, regenerated/overridden SPM snapshot | pending with new team | `confirmResubmit` |
| OPM docs → complete | OPM | accepted, six valid confirmed files | lead acceptance available; deadline starts | `confirmDocumentUpload` |
| Lead pending → confirmed | Lead | six docs and own pending Mobilization | remaining SPMs can accept; broken missing deadline DOM can interrupt | `acceptAssignment` |
| Others pending → confirmed | own SPM | OPM accepted, six docs, lead confirmed | confirms all own pending featured phases; all-team gate | `acceptMyPhase` |
| Assignment → declined/expired | SPM/system | reason for lead decline; hard deadline for expiration | OPM reassignment pending, response history, reset (broken references) | decline/deadline helpers |
| Team confirmed → subcontractor allocation | Lead | six docs + all named SPM rows confirmed | simulated matching unlock | `spmIntakeReady`, `updateDocProgress` |
| Company pending → approved | Admin | new-company request/version | directory entry; not subcontractor consent | approval helpers |
| None → contacted | Lead | selected/candidate company and ready intake | local contact-attempt timestamp only, no email | `contactSubconByEmail` |
| Contacted → accept/decline | Lead manually | invited state | accepted locked; declined removed/replaced | `simulateSubconResponse` |
| Consented team → signed agreement | Lead intended | nonempty accepted team, entire intake ready, file confirm | agreement on record; final gate attempted | `uploadSubconAgreement`, confirm |
| Final setup → active/client scope | system | agreement + ready intake + consent + resolvable client, no suspended client | new client active/existing scope linked; active site added at Mobilization 0% | activation functions |
| Active phase → evidence submitted | current SPM | current stage/ownership, confirmation | QA/QC pending; no percentage change at submit | checklist confirmation |
| Evidence → approved/rejected | OPM | submitted item | approved drives percentage; rejected missing/corrections | checklist approval helpers |
| Current stage → next stage | system | all required approved, no pending rework, named next owner confirmed if present | stage advanced, handoff/notice, past owner readonly | `autoAdvanceIfChecklistComplete` |
| Progress note → reviewed | OPM/system | pending normal update; three-day rules | visible history, pending cleared, no stage/% change | update helpers |
| Issue → rework decision | OPM | pending version | rollback to current stage floor or unchanged; never autoapprove | rework helpers |
| Closeout → project completed/archive | system intent | all closeout deliverables signed off | **Unverified**: no actual completion/archive transition engine | archive text; auto-advance stops at Closeout |

Approved intake ordering must be preserved even where old rendering labels or comments disagree.

### Construction progress calculation

`recalculateChecklistProgressPct` captures a project's current percentage as baseline once, sums approved-item fractions across seven stage templates, divides by seven, and sets rounded `baseline + (100 - baseline) × approvedShare`, bounded baseline..100. Percent is not typed by SPM. Historical seeded projects retain baseline, not a true recalculated schedule. Checklist-derived progress and separate rework stage-floor rollback are not reconciled.

Phase order: Mobilization → Design → Foundation → Structure → MEP Rough-in → Finishes → Closeout. The next named assignee must have confirmed. An absent next assignee is not rejected by the current handoff guard. Pending normal update does not block handoff in executable code despite contrary comments.

## 12. State transition map

```text
Intake queue:
  pending --OPM accept--> accepted --all SPM rows confirmed--> confirmed
  pending --Request Changes--> changes_requested --Admin resubmit--> pending
  accepted --lead decline / deadline--> pending + declinedInfo
  confirmed != Active Sites; final documents/consent/client gate still required

SPM phase:
  pending --own accept--> confirmed
  pending --own decline--> declined + spmName=null
  pending/declined --Admin/OPM reassign--> pending + new name
  confirmed --phase reaches stage--> active responsibility (derived, not status enum)
  confirmed --site advances beyond own phase--> completed readonly responsibility

Company approval:
  new request --> pending --Admin approve--> approved + shared directory
                         --reject/withdraw--> removed from request/team arrays

Subcontractor consent (independent of company approval):
  none --contact attempt only--> invited --manual Accept--> confirmed (locked)
                                      --manual Decline--> declined (removed from team)

Registered documents:
  missing --> selected local file --> confirmed uploaded (locked)
  selected --Back/Retry--> not committed (shared clearing/retry has defects)

QA/QC:
  missing --> selected --> confirmed submitted --OPM approve--> approved
                              |--OPM reject--> missing + correction note
                              |--3 days--> submitted + escalated=true (never approved)

Normal update:
  none --> pendingUpdate + hidden submitted history
    --> OPM approve --> visible resolved history + clear pending
    --> 3 days nonmaterial --> same resolution automatically
    --> 3 days material --> escalated + still pending

Issue:
  none --> pendingRework + hidden history
    --> approve --> system rollback + visible resolution + clear pending
    --> decline --> unchanged percentage + visible resolution + clear pending

Client:
  saved draft --> queued pending setup --> active scoped account at final gate
  existing active --> unchanged scope during intake --> new scope link at final gate
  suspended --> blocks activation

Account:
  generic creation --> invited (no working first-login activation path)
  nonsuspended --Suspend--> suspended --Reactivate--> active
  pending-setup/pending-activation --> blocked login
  removed is archive display intent, not implemented account lifecycle
```

## 13. Notification and activity inventories

### Notification behavior

- Important types: `request`, `approval`, `progress`, `notice`; each new entry initially unread.
- Feed uses a global array; last 10 important, unmuted records shown, all unread unmuted counted.
- Mark all read affects every important event, not just current role/account/project.
- Clicking navigable event marks read, then checks role target; denied navigation still marks it read.
- No email/SMS/push transport; “notify” generally means local feed or button feedback.
- Mute requests/approvals/progress/notices hides those from bell, not full log; state shared within runtime, reset on reload.
- License reminder, phase activation/handoff, approvals, pending work create notices/events; banner is separate from recipient-safe notification delivery.

### Explicit activity call-site families

| Event | Type / target | Source |
|---|---|---|
| Sign in / sign out | login/logout, no target | `attemptLogin`, `logoutSession` (idle also calls logout) |
| OPM 24h cooldown / clear override | account → Admin/accounts | `startOpmCooldown`, `clearOpmCooldown` |
| Project resubmitted | request → OPM/confirmqueue | `confirmResubmit` |
| OPM confirmed intake | approval → Admin/intake log | `acceptOPMConfirmation` |
| OPM requested changes | request → Admin/intake log | `requestOPMChanges` |
| Account suspended/reactivated | account → Admin/accounts | `toggleAccountStatus` |
| Account details updated / created | account → Admin/accounts | `saveAccountEdit`, `createAccount` |
| Intake sent | request → OPM/confirmqueue | `confirmAndSendToOPM` |
| License added | account → Admin/engineer directory | `saveAddLicense` |
| License renewal reminder | notice → engineer role/engineers | `notifyEngineerAboutLicense` |
| Contact attempt recorded | request → SPM/assignment | `contactSubconByEmail` |
| Subcontractor acceptance manually recorded | approval → SPM/assignment | `simulateSubconResponse(true)` |
| Subcontractor decline | request → SPM/assignment | `simulateSubconResponse(false)` |
| New company request | request → SPM/assignment | `submitNewSubconRequest` |
| Company request approved / rejected | approval/request → Admin/pending queue | Admin approval helpers |
| All assigned SPMs confirmed | approval → OPM/assignment | `refreshAldenAssignmentWorkflow` |
| Progress update approved / autoapproved | approval → OPM/reworkqueue | approval/background helpers |
| Material progress review escalated | approval → OPM/reworkqueue + Admin banner | background helper |
| Watermarked document viewed | view → current role, repo target | `openDocPreview` |
| Lead accepted | approval → SPM/assignment | `acceptAssignment` |
| Lead declined | request → SPM/assignment | `confirmDeclineAssignment` |
| Legacy checklist document submitted | progress → SPM/activesites | `submitChecklistDoc` |
| Stage automatically advanced | approval → OPM/reworkqueue | `autoAdvanceIfChecklistComplete` |
| Next phase active | notice → SPM/assignment | same |
| QA/QC document approved/rejected | approval/request → OPM/reworkqueue | approval/rejection helpers |
| QA/QC review escalated | approval → OPM/reworkqueue + Admin banner | `checkChecklistEscalations` |
| All six OPM documents uploaded | approval → SPM/assignment | document confirmation |
| Employment / engagement agreement uploaded | account → Admin/directory or repo | document confirmation |
| Checklist evidence confirmed submitted | progress → SPM/activesites | `confirmChecklistUpload` |
| Own phase confirmed / declined | approval → SPM / request → Admin | `acceptMyPhase`, `declineMyPhase` |
| Demo phase started | notice → SPM/assignment | `simulateAdvancePhase` |
| Current phase activated | notice → SPM/assignment | `activateCurrentPhaseOwner` |
| Progress issue / normal note submitted | request → SPM/activesites; progress → OPM/reworkqueue | `submitProgress` |
| Phase reassigned | account → SPM/assignment | `reassignPhaseSpm` |
| Site update requested | request → SPM/activesites | `requestSiteUpdate` |
| Rework approved / declined | approval/request → OPM/reworkqueue | rework helpers |
| New client activated | account → Admin/accounts | client activation |
| Project activated | approval → Admin/activesites | `addAldenToActiveSites` |

Share-link create/revoke events exist in source but are **Excluded**.

Seeded historical feed includes login/logout, prior intake, progress, new company request, account creation, confirmation. Seed history is illustrative, not proof those transitions ran.

No explicit activity calls verified for rule changes, notification preference/read changes, most downloads/exports, license renewal/undo, worker edits/headcount, company withdrawal, contract upload alone, agreement upload alone, diary/photo changes, deadline expiry, or archive actions. `view` is not in labels/icons map, so full log metadata can render an undefined label; it is not an important notification type.

## 14. Source-code limitations, contradictions, and missing behavior

1. **No backend/security/persistence.** In-memory accounts/state, plaintext demo credentials, DOM-derived data, browser timers and blob URLs. No secure auth, API authorization, secure file storage, durable audit log, real concurrent transactions, email, background jobs, report/PDF service.
2. **Workflow tied to one sample.** Queue item 1/site 4/Alden names and fixed submitter; only featured project gets full docs/assignment/activation wiring. New intake items accepted elsewhere do not gain generic downstream workflow.
3. **Missing deadline DOM.** `deadlineSimBtn`, `assignmentDeadlineBadge`, `assignmentDeadlineText` referenced but not defined in static or dynamic markup. `startAssignmentDeadline` unguardedly touches missing button after sixth doc commit. `stopAssignmentDeadline` similarly interrupts lead acceptance after row mutation. Runtime reproduction is Unverified; source-level missing-reference defect is verified.
4. **Missing lead decline DOM.** `declineNoteWrap`, `declineReasonInput`, `declineReasonError` absent; lead Decline control calls `showDeclineNote`. Reset uses undeclared `subconUploadBtn`. Old accept-button IDs also absent, although their accesses are mostly guarded.
5. **Broken general upload Retry/clear.** Opening stores `{kind,file,meta}`; callers put input in `meta.input`; retry/back read `pending.input`. No current `meta.retry` callbacks supplied. Checklist confirmation correctly uses top-level input.
6. **Evidence preset gaps.** General field and checklist files have accept attributes but no size/extension preset checks. Preserve approved presets centrally rather than reproducing gap.
7. **New accounts cannot activate as advertised.** `createAccount` omits password field and marks invited; login explicitly blocks invited. No first-login activation or reset handler.
8. **Client access incomplete.** Overview hard-coded; renderer referenced but undefined; project scope not checked in detail/report/download helpers. Activation gate doesn't make these helpers secure.
9. **Role guards incomplete.** Account edit/rule change/worker edit/add/manual subcontractor swap/selection/preview/download and various helpers lack equivalent guards. Some SPM mutators require role but not Lead or project/phase scope.
10. **OPM scope incomplete.** Monitoring, confirmation, deadlines and review queues commonly iterate all records; role guard without OPM-of-record check. Repo filtering is not universal authorization.
11. **Admin escalation resolution missing.** Banner implies Admin can resolve; progress/checklist/rework approval functions require OPM. Admin view-as retains Admin session, so does not solve guard.
12. **Notifications leak operational context.** Feed/global unread state not recipient/project filtered. Targets often point at actor role, not next responsible role; invalid anchors e.g. OPM `assignment`, Admin `activesites`, engineer reminders for roles with no engineer nav.
13. **Archive automation absent.** Static HTML rows/button labels and tab switching do not implement 30-day intake archival, closed project transfer, resolved response history, permanent account removal/reinstatement, or archived document viewing.
14. **Construction completion missing.** Closeout checklist exists and percentage can reach 100, but no verified completed-project flag/removal/archive transition. “Project Assignment Completed” is intake success, not end-of-construction closeout.
15. **Rework/progress model conflict.** Rework floor rollback does not reset checklist approvals/baseline; recalculation may restore higher progress. No defined correction/reset policy.
16. **Material update behavior inconsistent.** Comments describe numeric updates; current submission uses current stage/percentage; resolution does not apply requested values. Material path ordinary UI use Unverified.
17. **Consent completeness weaker than required coverage.** Checks nonempty confirmed selected nonpending companies; ignores pending requests, required trades, actual workforce sufficiency, certificate verification, client-only team edge case.
18. **Misleading synthetic operations.** Schedule curves, CSV full labor pools, Add Headcount fallback, and project-detail “photo upload” generate data. No real location matching, real workforce optimization, live schedule baseline, or full crew export verified.
19. **Licensing date frozen / renewal bypass.** Fixed reference date; no new renewal expiry; renewed flag bypasses grace indefinitely. License document binary not retained. No verified certificate-document approval flow.
20. **Account edit is not atomic.** Identity fields mutated before invalid discipline error; scope assignments keyed by names do not follow renames reliably; client arbitrary names and no last-Admin/self-suspend protection.
21. **Allocation eligibility incomplete.** Includes invited/expired-license accounts; cap only warns; zero-match candidates allowed; active-lead exclusion can wrongly affect same-project reassignment when site exclusion not passed.
22. **Final gate messaging not transactional.** Agreement UI/success/modal can precede failed client activation; no exposed recovery path for suspended/missing client.
23. **No required engagement/employment gating.** These categories exist but are not activation prerequisites; do not invent such a gate.
24. **Readonly not secure.** Watermark/no-download button doesn't prevent direct local access, screenshots, helper invocation, or browser blob access.
25. **Stored originals not used consistently.** Local Files exist for some uploads, but repositories generate metadata placeholder `.txt` instead. No virus/MIME/signature checks.
26. **Timer limits.** Deadlines/autoapproval/escalation only while page lives/renders; holidays/time-zone policy, server time, reload recovery Unverified. Changing rules doesn't consistently migrate existing timers.
27. **Concurrency simulation only.** Expected versions/stale banners exist in some workflows, not universal and not server-backed. QA/QC does not use versions. Some demos remove pending object before stale action, causing silent return rather than conflict banner.
28. **Input/render safety incomplete.** HTML escaping helpers protect some paths, many others concatenate names/notes into `innerHTML`/inline handlers. No reliable global untrusted-content safety.
29. **Accessibility/mobile not established.** Old small text, desktop shell, partial responsive CSS; no verified comprehensive focus management, keyboard navigation, contrast audit, or outdoor target sizes.
30. **No demonstrated billing/invoicing, procurement, financial approval, real email invitations, labor payroll, or public client uploads.** Mentioned concepts or budget documents do not establish these as modules.

### Decisions explicitly unresolved (do not invent)

- Actual archive lifecycle/reinstatement/retention and closed-project document access.
- Construction completion policy and how approved closeout transitions records.
- Correct reconciliation of rework rollback with previously approved checklist progress.
- Admin escalation decision authority and UI versus OPM-only existing guards.
- Exact required subcontractor trades/headcount per project and pending-company blocking policy.
- General multi-project workflow, client multi-project navigation and account activation/credential delivery.
- Real license renewal validity dates, certification verification, worker correction/offboarding.
- Whether additional phase acceptance should be per-person or per-phase outside featured project.
- Production holiday calendar/time zone, scheduling source, notification recipients and delivery.
- No missing business rule above should be silently filled with a convenient assumption.

## 15. Rebuild checklist

### Functional coverage

- [ ] Preserve all nonexcluded navigation and secondary surfaces in §§2–7.
- [ ] Build project-scoped state instead of global featured-project flags/DOM as source of truth.
- [ ] Centralize role + project + Lead + phase ownership checks, fail closed for unknown scope.
- [ ] Preserve approved intake sequence and immediate OPM success modal with Continue/Later.
- [ ] Six mandatory OPM docs before Lead acceptance, Lead before remaining SPM acceptance.
- [ ] Recreate recommendations, size-tier headcount, cooldown/exclusion, snapshots, resubmission.
- [ ] Preserve assignment responses, reason requirement, deadline targets/escalations; repair missing UI.
- [ ] Contact action local recording only; manual Accept/Decline; accepted company lock.
- [ ] Keep client-provided company immutable in normal SPM coordination.
- [ ] Preserve new-company Admin approval separately from subcontractor acceptance.
- [ ] Implement all exact checklist templates, human QA/QC, rejection/resubmit, three-day escalation.
- [ ] Preserve readonly percentage, current-owner progress, Other explanation, pending review states.
- [ ] Preserve confirmed-next-owner handoff and previous-owner completed readonly records.
- [ ] Resolve rework/checklist progress contradiction explicitly before choosing new logic.
- [ ] Preserve all document categories and repository separation/client whitelist.
- [ ] Apply confirmed upload presets to every document/evidence entrypoint.
- [ ] Reusable confirmation Back/Retry/Confirm; do not mark uploaded on selection.
- [ ] Preserve accounts, license/grace, employment/engagement, actual worker records/import queue.
- [ ] Identify synthetic schedule/workers/CSV/photo demo behavior honestly.
- [ ] Implement scoped notifications/activity with verified source events; mark changed recipient policy explicitly.
- [ ] Preserve archive modules but do not claim source automation exists; resolve missing behavior.
- [ ] Distinguish assignment setup completion from construction completion.
- [ ] Remove all public-share UI/settings/archive/events, no substitute.

### Verification and backend boundaries

- [ ] Verify all four roles, separate Lead/nonlead SPMs and multiple projects/accounts.
- [ ] Check unauthorized direct handler/API paths, not just hidden buttons.
- [ ] Check missing/invalid files, 10/15MB boundary, Back/Retry/same-file reselection.
- [ ] Check decline/reassignment, no eligible candidates, invited/suspended/expired users.
- [ ] Check every final activation prerequisite and client suspended/missing recovery.
- [ ] Check accepted subcontractor/phase lock and stale-version actions.
- [ ] Check normal update autoapproval vs material escalation; never QA/QC/rework autoapproval.
- [ ] Check no client internal-document/personnel/diary/pending-history exposure.
- [ ] Clearly label simulated authentication/authorization/storage/notifications; no production claims.
- [ ] Obtain decisions for Unverified business behavior, rather than inventing it.

### Visual implementation remains deferred

- [ ] Construction Daylight, not old source visuals.
- [ ] Inter; minimum 14px visible text, preferred 16px body.
- [ ] Approved green/light-neutral palette, high contrast, large mobile targets.
- [ ] Site PM mobile-first, keyboard-accessible dialogs/forms, responsive operational tables.
- [ ] No visual implementation until audit reviewed; this document introduces no app UI.

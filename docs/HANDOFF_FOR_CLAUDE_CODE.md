# SITELINE — Complete Handoff Context

Read this first. It summarizes the product rules, architecture, data model, workflow engine, UI, tests and known caveats of SITELINE as built in Figma Make.

## 1. Product summary

SITELINE is a role-based construction operations platform. It is a client-only demo: React 19 + TypeScript 5.7 + Vite 8 + Tailwind CSS v4. All state lives in the browser (`localStorage`). There is no real backend yet.

Four roles (`src/model.ts` `ROLE_NAMES`):

| Key | Role | Notes |
|---|---|---|
| `admin` | Administrator | Creates projects and accounts, manages the company directory, archives/deactivates records, sets rules |
| `opm` | Office PM | Accepts projects, uploads six required documents, reviews progress/checklists, activates projects |
| `spm` | Site PM | Mobile-first. Assigned per phase. The first/lead assignment on a project is the **Lead Site PM** (`leadId(p)` in `workflows.ts`) |
| `client` | Client | Read-only portal for their own projects, plus review/acknowledgement of client-provided subcontractors |

### Hard product rules (do not break)

- No Forgot Password, no Reset Password, no public Sign Up.
- Users can never select or change their own role. Role comes from the account record only.
- External Share Links are excluded. Do not add or re-enable them.
- Site PM screens are mobile-first with touch targets of at least 48px.
- Minimum text size is 14px everywhere.
- No permanent deletes. Use **archive** (records) or **deactivate** (accounts).
- Subcontractor contact attempts are recorded locally only. Nothing is actually emailed or called.
- The subcontractor directory stores companies only. No individual worker records. Manpower is a total count plus uploaded XLS/XLSX manpower lists.

### Demo Session dropdown (exactly five accounts)

| ID | Name | Role |
|---|---|---|
| `a1` | Patricia N. Domingo | Administrator |
| `a2` | Renz D. Villaverde | Office PM (Residential, Mixed-Use) |
| `a4` | Karlo M. Espiritu | Site PM (Structural, Civil, Landscape) |
| `a5` | Rafael D. Mercado | Site PM (Mechanical, Electrical, Plumbing) |
| `a9` | Ferdinand Uy | Client (scope `p1`, `p4`) |

Other seeded accounts exist but are not in the dropdown: `a3` Lea M. Fernandez (OPM, Commercial/Mixed-Use), `a6` Mikaela Bautista, `a7` Diego A. Salvador, `a8` Bea R. Concepcion (all SPMs). Seeds are in `initialState()` in `src/model.ts`.

Email/password sign-in posts to `/api/auth/login` (`signIn` in `App.tsx`). That endpoint does not exist, so the UI shows "Authentication service is not connected. Use Demo Access". The login expects `{ accountId }` back and refuses non-`active` accounts.

## 2. Visual identity

| Token | Value |
|---|---|
| Deep Navy (primary) | `#172B4D` |
| Steel Blue (links, secondary actions) | `#315A85` |
| Slate Blue (control borders, accents) | `#647D9B` |
| Page background | `#F3F5F8` |
| Cards | `#FFFFFF` |
| Primary text | `#1F2937` |
| Secondary text | `#64748B` |
| Borders | `#D8E0E8` |
| Success / Warning / Danger | `#15803D` / `#B45309` / `#B42318` |

- Font: Inter (Google Fonts, wired in `src/index.css`). Minimum 14px.
- Tokens are CSS variables at the top of `src/construction-daylight.css`. Some variable names are legacy, e.g. `--green-dark` and `--green-soft`, but now hold blue values. Keep the names unless you rename them everywhere.
- **Stale doc:** `docs/CONSTRUCTION_DAYLIGHT.md` still lists an older green palette (`#245C45` and others). The CSS is the source of truth.
- Status is never shown by color alone. Always include a label or icon.

## 3. Repository map

| File | Lines (approx.) | Responsibility |
|---|---|---|
| `src/main.tsx` | 11 | Mounts the app; imports `index.css` then `construction-daylight.css` |
| `src/App.tsx` | 3800 | App shell, auth/demo session, localStorage persistence (`siteline-admin-workspace-v1`), Admin and Office PM screens, intake wizard, modals, credentials display |
| `src/RoleWorkspace.tsx` | 3780 | Role workspaces (Site PM mobile views, OPM review queues, project detail, documents browser, directory) |
| `src/LeadSubcontractorPanel.tsx` | 920 | Lead SPM subcontractor allocation: select, contact log, Accept/Decline, replace, lock, agreement upload, suggest company |
| `src/ClientPortal.tsx` | 1020 | Client portal (projects, progress, photos, client-visible docs, timeline) |
| `src/ClientSubconReview.tsx` | 410 | Client review/acknowledgement of client-provided subcontractor, issue reporting |
| `src/panels.tsx` | 2000 | Shared panels: charts (SVG `Chart`), activity, settings, tables |
| `src/ui.tsx` | 340 | Shared primitives (buttons, fields, modals, badges, file inputs) |
| `src/LoginPage.tsx` | 150 | Login + Demo Session dropdown |
| `src/PhaseTimeline.tsx`, `src/PlannedTimeline.tsx` | ~50 each | Timeline visuals |
| `src/model.ts` | 1070 | **Domain types, constants, seed data, pure helpers** |
| `src/workflows.ts` | 1850 | **Workflow engine**: `applyWorkflow(state, actor, command)`, timers, gates, activation checks, resignation |
| `src/client-access.ts` | 270 | Client-scoped projections (what a client may see) |
| `src/project-document-index.ts` | 230 | Four-level document browser index built from canonical uploads (no duplication) |
| `src/index.css`, `src/construction-daylight.css` | 1280 / 660 | Global styles and design tokens |
| `tests/*.test.mjs` | — | Node built-in test runner suites (see section 9) |
| `docs/` | — | Earlier audits/indexes. `SITELINE_FUNCTIONAL_AUDIT.md` and `SITELINE_SOURCE_INDEX.md` describe the original HTML prototype (`SITELINE_subcontractor_swap_locked.html`) this app was ported from |

Architecture rule: **domain logic belongs in `model.ts` / `workflows.ts` / `client-access.ts` / `project-document-index.ts` (pure, tested). Components dispatch `WorkflowCommand`s and render.** Do not put authorization or state transitions in JSX.

## 4. Data model (`src/model.ts`)

`State = { accounts, projects, companies, events, rules, muted, userPreferences?, portalReads? }`

- **Account**: `id, name, role, email, phone, scope[]` (disciplines for SPM, project IDs for client), `projectTypes[]` (OPM), `status: active | invited | suspended | deactivated | pending-setup`, `license, expiry, renewed?, cooldown?, assignmentHold?, resignation?, resignationHistory?, docs[]`.
- **ResignationRecord**: `notice | deactivated`, `noticeDays`, `effectiveDate`, `confirmedBy`, `letter: Doc`.
- **Project**: `id, name, type, area, floors, start, end?, clientId, opmId, status` (`active | pending | changes_requested | draft | completed | declined | expired`), `team[]` (`{ phase, accountId, status: pending|confirmed|declined, requiredDisciplines?, sequence? }`), `phase, progress, opmAccepted, docs[]` (7 canonical docs), `clientSubcon?`, `clientSubconEmail?`, `clientSubconReview?`, `workflow?`, `history[]`.
- **ProjectWorkflow**: `version` (optimistic concurrency), `responses[]`, `selections[]` (subcontractor selections), `checklist` (per phase), `pendingUpdate?`, `pendingRework?`, `deadline?` (soft/hard response timers), `activation?`, `handoff?`, `notes[]`, `photos[]`, `documentArchive?`, `changesHistory?`.
- **Company** (directory): `name, contact, phone, email, status: pending|approved|rejected|archived, availability: available|limited|committed, manpowerCount, activeProjectIds[], manpowerDocuments[]` (XLS), `documents[], committedUntil?, version, submittedById?, archivedAt/By?`.
- **SubcontractorSelection**: `companyId, status: selected → contacted → accepted | declined; replaced; archived`, timestamps.
- **Doc**: `label, name, url?, uploaded, clientVisible, owner, date, size?, mime?`. `validateFile(file, spreadsheet)` enforces types and sizes.
- **Rules**: `grace, cap, response, idle` (Admin-configurable).
- **Event**: notifications/activity with `recipientIds`, `readBy`.

### Canonical project documents (`DOC_LABELS`)

Indices 0–5 are the six Office PM required documents. Index 6 is uploaded by the Lead Site PM.

0. Notice to Proceed (client-visible)
1. Approved Building Permit (client-visible)
2. Signed Owner-Contractor Agreement
3. Structural & Architectural Plans (Registered) (client-visible)
4. Environmental Compliance Certificate (client-visible)
5. Project Budget & Bill of Quantities
6. Site PM–Subcontractor Agreement (Lead Site PM)

Client-provided subcontractor projects use `CLIENT_SUBCON_DOC = "Client & Subcontractor Agreement"` instead.

### Project types and phases

Step 1 of intake uses cards for **Residential / Commercial / Mixed-Use**. `PROJECT_TYPES` also lists Infrastructure/Industrial/Renovation for legacy data. `PROJECT_PHASE_DEFINITIONS` generates phases with discipline tags:

- **Residential (9):** Mobilization, Design, Foundation, Structure, Envelope, MEP Rough-In, Finishes, Landscape & Site Works, Closeout
- **Commercial (9):** Mobilization, Design, Foundation, Structure, Envelope / Curtain Wall, MEP Rough-In, Fire & Life Safety, Fit-Out / Finishes, Closeout
- **Mixed-Use (12):** Mobilization, Design, Foundation, Podium Structure, Tower Structure, Envelope / Curtain Wall, MEP Rough-In, Fire & Life Safety, Retail/Commercial Fit-Out, Residential Fit-Out, Landscape & Site Works, Closeout

Step 2 staffs each phase with SPMs whose `scope` covers the required disciplines (`spmCandidates`, `eligible`, `workload`, `headcount`). OPM candidates are filtered by `projectTypes` (`opmCandidates`).

## 5. Approved intake / activation sequence

Enforced in `workflows.ts` by gate helpers (`assignmentBlock`, `allocationReady`, `activationChecks`):

1. Admin creates the project (wizard: type card → phases/staffing → client → review).
2. Office PM accepts (`accept_opm`) or requests changes (`request_changes`). Acceptance opens a **success modal**.
3. Office PM uploads all six required documents (`upload_registered`). Check: `registeredComplete`.
4. **Lead Site PM** accepts (`accept_assignment`). Check: `leadConfirmed`. Other SPMs are blocked until then.
5. Remaining Site PMs accept. Check: `teamConfirmed`. Declines go to `reassign_phase`. Response deadlines are processed by `processWorkflowTimers` with business-day logic (`businessDeadline`, `REVIEW_MS` = 3 days).
6. Subcontractor allocation unlocks (`allocationReady`), Lead SPM only.
7. Lead SPM selects companies (`select_company`) and records contact attempts (`contact_company`, local log only).
8. Lead SPM records the response manually with Accept/Decline (`respond_company`). Declined companies can be replaced (`replace_company`).
9. Accepted companies are **locked** and can no longer be swapped.
10. Lead SPM uploads the signed Site PM–Subcontractor Agreement (`upload_agreement`).
11. All `activationChecks` pass: OPM accepted, six docs, team confirmed, subcontractors accepted (or client-provided subcon acknowledged), agreement (non-client-provided only), client ready.
12. Office PM activates (`activate_project`). Client account becomes active and linked (`scope` includes project), and the project becomes `active`.

### Client-provided subcontractor variant

When `clientSubcon` is set, the project captures **company name + email + agreement upload only** (no trade/scope). The Lead SPM allocation and Site PM–Subcontractor Agreement checks are replaced by `acknowledge_client_subcon` and `report_client_subcon_issue` → `resolveClientSubconIssue`. An open issue blocks activation (`openClientSubconIssue`).

## 6. Post-activation operations

- Progress: SPM `submit_progress` (phase/percent + evidence + issues). OPM `approve_update`, `request_update`. Rework uses `approve_rework` / `decline_rework`. Stage floors come from `STAGE_FLOORS` / `projectStageFloor`.
- Phase checklists (`CHECKLISTS`, `checklistFor`): `submit_checklist` → `approve_checklist` / `reject_checklist`, with version counters and escalation.
- Notes and photos: `add_note`, `add_photo`.
- `view_document` logs document access.
- Completion: `completionReady`.
- Every command carries `expectedVersion`. Stale versions are rejected with a conflict banner (optimistic concurrency).

## 7. Accounts, resignation and directory

- **Deactivation/resignation** (`beginAccountResignation`, `activeAssignmentsForAccount`): Admin records the notice period plus a resignation letter. The account gets an **Assignment Hold** (no new assignments), then deactivates on the effective date. History is kept. There are no deletes.
- **Archive** replaces every former delete (projects, companies, selections, requests).
- **Subcontractor Directory** (company-only):
  - Administrator: **Add Company** (approved directly).
  - Lead SPM: **Suggest Company** (`request_company`, pending until Admin approves/rejects; `archive_company_request`).
  - Shows availability (available/limited/committed, `committedUntil`), active projects, `manpowerCount` and XLS manpower list documents (parsed/validated with the `xlsx` package).
  - `subcontractorRecommendation(s)` ranks companies by availability/load.

## 8. Client portal and documents

- `client-access.ts` → `clientProjectViews`: only projects in the client's `scope`, only `clientVisible` docs (`CLIENT_DOCUMENT_LABELS`), client-visible history, photos and `phaseTimeline`. `resolveClientDocument` / `resolveClientPhoto` authorize single items. `clientProgressReport` builds the report.
- `project-document-index.ts` → `projectDocumentIndex`: four-level card browser (Category → Folder → File → preview). It **references** canonical `Doc`s from projects, workflow, checklists, companies and accounts, without copying them.

## 9. Commands and verification

```sh
pnpm test            # node --experimental-strip-types --test tests/*.test.mjs  (66 passing)
pnpm exec tsc --noEmit   # TypeScript check (clean)
pnpm build           # vite build (clean)
pnpm format          # oxfmt
```

Test suites: `workflows`, `post-intake`, `subcontractors`, `client-subcon`, `client-access`, `admin-rules`, `project-documents`, `construction-daylight` (style regression checks, e.g. min font size and palette), plus `fixtures.mjs`. Tests import the `.ts` modules directly, so keep domain modules free of React/DOM imports.

In Figma Make the dev server is host-managed. Do not start `pnpm dev` there. Locally, `pnpm dev` is fine.

## 10. Code conventions

- Default-export components. Use double quotes for strings with apostrophes.
- Domain changes need a test in `tests/`. Run `pnpm test` before UI work that depends on them.
- Keep persistence shape backward-compatible. If you change `State`, bump `STORAGE_KEY` in `App.tsx` or add migration in the load path (around `App.tsx` line 96).
- Keep the 14px minimum and the 48px SPM touch targets. `construction-daylight.test.mjs` checks the styles.

## 11. Known gaps / next steps for a real build

- No backend. Real auth (`/api/auth/login`), persistence, file storage and email are all stubs. Uploaded files are browser object URLs/data in localStorage, so the storage quota limits them.
- Timers (`processWorkflowTimers`) run client-side only.
- `docs/CONSTRUCTION_DAYLIGHT.md` palette is out of date.
- `App.tsx` and `RoleWorkspace.tsx` are large (~3.8k lines each) and are good candidates for splitting by role/screen.
- `PHASES` and `DISCIPLINES` constants are legacy defaults. Per-type phases come from `PROJECT_PHASE_DEFINITIONS`.

# Administrator project blocker banner

The banner sits below the organization/date row and above Workspace overview.
It summarizes confirmed blocked handoffs; Needs attention remains the complete
task list. There is no permanent dismiss action and no zero-blocker banner.

## Authoritative conditions

The authorized `/workspace/project-data` response now includes Administrator-only
`handoffReadiness`. `assessPhaseHandoff` is shared with automatic handoff, which
continues to initialize scope and execute the transition within its existing
transaction and project lock. Dashboard assessment does not initialize future
checklists or change assignments, approvals, evidence, or workflow position.

Only an active project with a valid, fully approved required current checklist
and a subsequent workflow phase can yield a banner blocker:

- Existing pending rework, progress or subcontractor review holds.
- Missing confirmed current-phase Site PM.
- Missing confirmed next-phase Site PM.
- Invalid stored required scope in the next phase.

An absent next-phase snapshot is unknown during the read-only assessment, not
a fabricated scope blocker. Normal handoff may initialize that scope through the
existing template path. Missing/invalid current scope is unknown, incomplete
activities are incomplete, and final phases use existing completion checks.
Expired licenses are not independently flagged by this banner: the current
handoff function does not impose a separate license gate. No new gate was added.

The mutation endpoint retains its existing pending-review conflict precedence.
The dashboard additionally requires completed current work before escalating
that hold. Existing final-phase completion and automatic handoff stay in place.

## Shared task and refresh behavior

`adminDashboardOverview` creates one `project:{id}` item per blocked project and
reuses it instead of adding a second ordinary project-review item. Blockers are
ordered by project name and ID; there is no existing blocker severity ranking.
The banner derives its distinct-project count directly from these task objects.
Sidebar Active sites counts use the same selector and describe reviews/blockers.

One blocker opens the existing project modal, including its personnel and phase
assignment controls. Several blockers focus Needs attention and temporarily
filter it; normal category buttons restore the usual list. No new review or
assignment screen was created.

Administrator accounts now participate in the existing 15-second visible-page
and window-focus refresh. Successful mutations reload the same workspace.
Initial loading or failed reads hide the banner; old task records may remain
visible in the existing list during a network failure and are not an all-clear.
The banner has no live-region role, avoiding repeated polling announcements.

## Local verification

Use only a local/disposable database and the matching frontend and backend.

1. Sign in as Administrator and open Dashboard. Incomplete projects alone must
   not show the banner; neither should finished/archived projects.
2. On a test active project with confirmed current Site PM and a configured next
   phase, arrange for all required current activities to receive Office PM
   approval while the next Site PM assignment remains unconfirmed.
3. Refresh. Check the single-project banner, its exact reason, one shared Needs
   attention item, and the Active sites attention count. Review issue must open
   that project's existing details and assignment controls.
4. Repeat with another test project. View blockers must focus Needs attention,
   show the two project entries, and preserve ordinary category navigation.
5. Confirm the next assignment through the existing authorized workflow. After
   automatic reconciliation and refresh, the project advances and its banner
   entry disappears. There is no manual activation requirement.
6. Fail the workspace request in local developer tools. The banner disappears
   without displaying a fabricated zero/success message; restore connectivity
   and refresh to obtain current authoritative results.
7. Check narrow mobile layout and keyboard focus. OPM, Site PM and Client
   dashboards must not acquire this Administrator banner or its API projection.

No schema migration is required. Deploy matching frontend and backend code
together after review. Git publication alone does not update a running local
backend process. No hosted database access is required for this change.

## Changed files and checks

- Backend: `handoff.utility.js` (shared assessment), `phase.utility.js` (optional
  read without initialization), `workspace/project-data.controller.js`
  (authorized Administrator projection).
- UI/domain: `AdminDashboard.tsx`, `admin-dashboard.css`, `admin-dashboard.ts`,
  `navigation-attention.ts` (one shared task source and counter).
- Integration: `App.tsx` (refresh availability and Administrator polling),
  `api/adapter.ts`, `model.ts` (typed server assessment).
- Tests: `tests/admin-dashboard.test.mjs`, `tests/api-backend.test.mjs`.
- Documentation: this file.

Verified locally: 285 application tests, 86 backend tests, TypeScript check,
backend `lint:phase`, targeted workspace-controller lint, and production build
all passed. Build retains existing Vite configuration/chunk-size warnings.
UI interactions were tested in JSDOM; a real-browser visual review is still a
manual verification step. Test databases were disposable PGlite instances;
no hosted database connection or schema change was performed. No commit or push.

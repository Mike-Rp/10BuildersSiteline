# UX connection audit — 13 November 2026

Scope: current local source and isolated runtime tests. This is an investigation,
not a deployment audit or a claim that every possible workflow has been exercised
in a real browser. No application code or configured-database data was changed.

## Confirmed findings

| Priority | Area | Trigger and visible result | Source | Recommended fix |
| --- | --- | --- | --- | --- |
| Medium | Engineer responsibilities | The initial API request fails. The catch records an error, but the component returns null before rendering it because context is absent. The entire section disappears, including acceptance/completion actions, without an explanation or retry control. | `src/EngineerResponsibilities.tsx:19`–`20` | Render loading/error/retry states before the availability guard. Preserve authorization and genuinely unavailable feature states. |
| Medium | Monthly summary queue breakdown | No projects have historical pending coverage. The main pending card says Unavailable, while Evidence / Progress reports / Rework requests show 0 because the empty set of covered projects is reduced from zero. Partial coverage also produces unlabeled subtotals in that breakdown. The print/CSV generators use these same numeric subtotals. | `Thesis-Backend/src/domain/monthly-summary.js:71`–`81`, `src/Reports.tsx:133`, `Thesis-Backend/src/domain/report-export.js` | Preserve unknown values and label partial totals consistently across preview, print, PDF and CSV. This is a misleading display, not a disconnected button. |
| Medium, browser-dependent | Credential and license document previews | View supporting credential document / View document / View license document / View submission download a blob and then call `window.open`. There is no blocked-popup fallback; a browser that blocks the tab can leave the click without a document or in-app explanation. This condition is visible in the code; popup behavior was not verified in a real browser during this audit. | `src/EngineerCredentials.tsx:175`, `src/api/licenses.ts:35`–`38`; callers in `src/LicenseWorkflow.tsx` and `src/RestrictedRenewalPage.tsx` | Use an authorized in-page preview with a download fallback, or open a window directly from the user gesture and manage failures. Do not rely solely on `window.open`'s return value with `noopener`. |

## Connected paths checked

- AST scan of 765 native/custom buttons, links and form controls in top-level
  TSX files found no ordinary button missing its handler/form wiring. This checks
  structure, not the correctness of every handler.
- Forgot password's hash link invokes a dialog handler, so it is not a dead link.
- The empty legacy upload callback is bypassed by its real batch-save callback.
  The unused `onNewCompany` callback is not called by a visible button in the
  allocation components inspected.
- Allocation requests, phase allocation, engineer responsibilities, reassignment,
  evidence history/review and phase uploads have backend registrations. Some
  routes are registered by helper functions or mounted by the workspace router;
  a search limited to the main route file would incorrectly flag them as absent.
- The main application does not mount the extension demo provider. Its demo
  components return null without that provider; they are not live fake-save
  buttons exposed in the normal workspace.
- The monthly-report unavailable values are a database-coverage issue previously
  confirmed in the configured database, not missing click handlers. See
  `MONTHLY_REPORT_BACKEND_INVESTIGATION.md` for the separate migration steps.

## Runtime validation

The real React app was run in jsdom against an isolated PGlite PostgreSQL backend
with fixture users. Navigation, URLs, history/session restoration and project
details passed for an administrator, an Office PM, two Site PMs and two clients.
Cross-role routes and client unauthorized-project links were also checked.

The first concurrent test run exhausted Windows paging capacity. One Site PM
smoke result inspected the page while the workspace was still loading; its
isolated rerun passed every navigation/security check. The resource failure is
not reported as an application defect. Component tests were restarted serially.

Component checks cover workspace search destinations, Office/Site PM desktop and
mobile navigation, notification actions, monthly report filters/details/exports,
backup requests, upload feedback, responsibility previews and subcontractor
allocation controls. All 21 selected component tests passed in the serial run.
These tests use isolated fixtures/mocks where specified;
they do not prove that a hosted database has every prerequisite migration,
private file, backup worker or service configured.

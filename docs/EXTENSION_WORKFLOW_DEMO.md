# Project delay and extension approval prototype

This is an isolated frontend prototype inside SITELINE. No API, database, real account, actual project deadline, phase checklist, intake, or subcontractor-allocation workflow is changed.

## Open the demo

Run the existing Vite frontend (`npm run dev:web` if it is not already running). Open `http://127.0.0.1:8443/?extensionDemo=1`, or select **Extension Workflow Demo · Development Only** on the application. The demo does not require signing into the backend. It reuses the existing SPM/OPM workspace, Active Sites, Client Portal, buttons, fields, badges, and accessible modals.

The entry and account switcher are enabled in local development and in the explicit `extension-demo` build mode. Vercel uses `npm run build:demo` so the hosted frontend includes the isolated prototype at `https://10builderssiteline.vercel.app/?extensionDemo=1`, with a persistent FRONTEND DEMO label. Standard `npm run build` production builds keep the demo disabled, including when the query parameter is present. **Exit Demo** returns to the normal application and its existing authentication flow. The demo account selector only selects synthetic local records; it never signs in as a real user or grants access to production records.

## Accounts and access

Use **Demo account** at the top of the screen. These are synthetic account selections, not authenticated sessions or changes to real accounts.

| Account | Demo role | Feature location |
| --- | --- | --- |
| Rafael D. Mercado | SPM | Active sites → Request Extension, or open a site's extension requests |
| Renz D. Villaverde | OPM | Deadlines → Extension Requests; also available in Active sites |
| Ferdinand Uy | Client | Project Overview → Extension Approval Requests; use Your project to switch projects |
| Patricia N. Domingo | Admin | Active sites → Delay & Extension Monitoring; reports are read-only |
| Mikaela Bautista | SPM | Only Demo Reyes Annex is assigned to this SPM |
| Isabel Reyes | Client | Only Demo Reyes Annex is associated with this Client |

Staff demo navigation focuses on Active sites and Deadlines. Live profile editing, phase operations and other staff modules are excluded from this demo session. Normal application navigation remains unchanged.

## Initial scenarios

All projects are explicitly labeled as demo records by the persistent banner and extension panels. Existing fixture-style project/account identifiers are used internally in a dedicated store; real records with the same identifiers are never loaded or modified.

| Scenario | Project | Starting position |
| --- | --- | --- |
| A | Santos Residence | Original ETC / approved deadline October 26, 2026; mock progress 85%; Rafael requests November 25, 2026 |
| B | Demo Reyes Townhouse | Submitted report with demo PDF evidence, pending OPM review |
| C | Demo Rivera Retail Fit-out | Endorsed by Renz, pending Ferdinand's decision |
| D | Demo Cruz Duplex | Original ETC September 30, 2026; first approved deadline October 20, 2026 has passed; ready for a second request |
| Assignment isolation | Demo Reyes Annex | Mikaela / Isabel; reliable progress is missing and the report displays Progress Unavailable |

For reproducible schedule testing, the demo reporting date is fixed at **October 27, 2026**, and shown in the toolbar. An unfinished ongoing project is Delayed when its current approved date is earlier than this date. Approval recalculates this mock schedule label. It never changes lifecycle, progress, phase evidence or completion status.

## Test the workflow

1. As Rafael, select **Request Extension** for Santos Residence. The form has exactly the eight requested fields. Project name, original ETC, current approved completion date, and progress are read-only. Submit with missing required inputs or a date on/before October 26 to check validation.
2. Enter a delay reason, remaining activities and November 25, 2026. Add local files to inspect filenames, MIME types and byte sizes; remove and replace them. **Save Draft** preserves incomplete work; reopen the current request and select **Edit Draft**. **Cancel** discards unsaved edits.
3. Select **Submit Delay Report**. The form closes and the request becomes Pending OPM Review. The approved deadline remains October 26.
4. Switch to Renz. In Deadlines, open the current request. **Return for Revision** requires a written reason. Switch to Rafael, open the request, read the feedback, select **Revise & Resubmit**, edit and submit. Every saved/submitted report version and review reason remains in history.
5. Switch to Renz and **Endorse to Client**. Confirm, with optional remarks. The status becomes Pending Client Approval, and the deadline remains unchanged. Renz can also **Reject Request**, with a reason, while it awaits OPM review.
6. Switch to Ferdinand. On Project Overview, select Santos Residence using **Your project**, open the report and **Approve Extension**. The confirmation updates the mock approved deadline to November 25. Original ETC remains October 26, progress remains 85%, and lifecycle remains Ongoing. View the deadline and review histories.
7. For Client rejection, select Demo Rivera Retail Fit-out and reject its endorsed request with a written reason. Its approved deadline stays October 24. Return to Rafael to view the rejection and create a new justified request.
8. For a second extension, Rafael submits a new report for Demo Cruz Duplex with a date later than October 20. Renz endorses, Ferdinand approves. Deadline history now contains the original ETC, the first approved deadline, and the second approved deadline, with approver/date metadata.
9. Switch to Patricia to inspect counts for delayed projects, pending OPM reviews, pending Client approvals, approved requests and rejected requests. Open reports to verify read-only access. SPM and OPM accounts cannot approve on the Client's behalf.
10. Open **Demo notifications** to inspect simulated status messages and mark them read. Switch between roles and refresh the browser: reports, deadlines, evidence metadata, history, notification reads, and the selected demo account persist.
11. Switch to Mikaela and Isabel to check assignment isolation and unavailable progress. Draft reports are private to their SPM; Clients only see reports that have been endorsed.
12. Select **Reset Demo Data**, then **Confirm Reset Demo Data** to restore all initial scenarios. Only the dedicated demo store is reset. The selected account is retained.

SPMs may also withdraw a draft, returned report or request awaiting OPM review using its confirmation dialog. A withdrawn or rejected request permits a new request; only one open request per project is allowed.

## Storage and limitations

- Shared React context is the in-session source of truth. The workflow and notification state are persisted under `siteline-extension-demo-v1`; account preference uses `siteline-extension-demo-account`. Existing authentication and production storage keys are untouched.
- This is a browser-local prototype. Separate browsers/devices do not share state. Concurrent tabs do not live-sync; refresh the other tab after changes. If browser storage is full or unavailable, a visible message explains that changes last only for the current session.
- File content is never uploaded, read, stored, downloaded or previewed. Only attachment metadata is persisted, including for seeded sample attachments. Evidence version history is preserved.
- Schedule performance uses the fixed demo date and approved deadline only. It is not a production schedule forecast. Mock progress is fixture data, never a calculated replacement for real project progress.
- No requested extension interactions remain incomplete. Real authentication, server persistence, actual uploads, message delivery and construction evidence validation require the existing/future backend and are intentionally outside this prototype.

## Frontend files

Modified: `src/App.tsx`, `src/RoleWorkspace.tsx`, `src/ClientPortal.tsx`.

Hosted preview configuration: `package.json` adds the explicit demo build script, and `vercel.json` selects it. No backend function configuration was changed.

Created: `src/extension-demo.ts` (fixtures, transitions, permissions and workspace projection), `src/ExtensionDemoContext.tsx` (isolated shared state/storage), `src/ExtensionWorkflow.tsx` (report, review and history UI), `src/ExtensionDemo.tsx` (development entry, account switcher and demo controls), `src/extension-demo.css` (scoped responsive styling).

Tests: `tests/extension-demo.test.mjs`, `tests/extension-demo-ui.test.mjs`. This guide: `docs/EXTENSION_WORKFLOW_DEMO.md`.

## Verification

`npx tsc --noEmit` and `npm run build` pass. The new state and DOM UI tests cover every approval path, drafts, validation, attachments, version history, second extensions, withdrawal, assignment checks, unavailable progress, reload persistence, notification reads and reset. The UI test mounts the actual App, traverses the existing role screens and verifies zero network requests during the demo interactions.

Existing authentication, Active Sites, Client Overview and construction-phase progress regression tests also pass. The backend, database, production deadlines and established phase evidence rules were not modified.

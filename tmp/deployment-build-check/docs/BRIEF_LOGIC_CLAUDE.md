# SITELINE — Logic brief (for Claude)

You are working on **business logic only**. UI (screens, styling, layout) is owned by a separate track (Codex).

## What SITELINE is

A role-based construction operations web app for 10 Builders Development and Construction Corporation. **Frontend-only and locally hosted**: React 19 + TypeScript + Vite 8 + Tailwind v4. There is no backend or database, and none is planned for now. State lives in the browser (`localStorage` key `siteline-admin-workspace-v1`, uploaded files in IndexedDB `siteline-files`). Keep all logic running in the browser.

Roles: Administrator, Office PM (`opm`), Site PM (`spm`, the first assignment on a project is the **Lead Site PM**), Client (read-only portal).

The full reference is `docs/HANDOFF_FOR_CLAUDE_CODE.md` (data model, intake sequence, commands). Read it first.

## Logic files (yours)

| File | Responsibility |
|---|---|
| `src/model.ts` | Domain types (`State`, `Account`, `Project`, `Company`, `Doc`, ...), constants, seed data (`initialState()`), pure helpers |
| `src/workflows.ts` | Workflow engine: `applyWorkflow(state, actorId, command)`, gates (`assignmentBlock`, `allocationReady`, `activationChecks`), timers (`processWorkflowTimers`), resignation |
| `src/client-access.ts` | What a client may see (`clientProjectViews`, `resolveClientDocument`, ...) |
| `src/project-document-index.ts` | Document browser index that references canonical docs without copying |
| `tests/*.test.mjs` | Node built-in test runner suites (66 tests) |

These modules must stay **pure and free of React/DOM imports**, because the tests import the `.ts` files directly.

## How logic connects to the UI

- `WorkflowCommand` (in `workflows.ts`) is the contract. The UI builds a command and calls `sendWorkflow` in `App.tsx`, which runs `applyWorkflow` and returns `{ ok: true }` or `{ ok: false, error }`. Throw an `Error` with a user-readable message to reject a command.
- Every command carries `expectedVersion` (optimistic concurrency). Reject stale versions.
- `applyWorkflow` validates actor, account status, project scope, phase ownership, file presets and record status. Keep authorization there, not in JSX.
- **Known exception:** some Admin edits (accounts, rules, directory) still go through a `commit(...)` helper inside `App.tsx` instead of `applyWorkflow`. Moving those into `workflows.ts` with tests is a reasonable logic task. Coordinate the `App.tsx` call-site change with the UI track.
- When you add or change a command or helper the UI needs, document its name, inputs and error cases so the UI side can wire it up.

## Approved intake / activation sequence (enforced by gates)

1. Admin creates the project. 2. Office PM accepts or requests changes. 3. Office PM uploads the 6 required documents. 4. Lead Site PM accepts. 5. Remaining Site PMs accept (declines → reassign; business-day deadlines). 6. Subcontractor allocation unlocks for the Lead only. 7–9. Lead selects companies, logs contact, records Accept/Decline manually; accepted companies lock. 10. Lead uploads the Site PM–Subcontractor Agreement. 11. All `activationChecks` pass. 12. Office PM activates; client account links to the project.

Client-provided subcontractor variant: allocation + agreement checks are replaced by client acknowledgement (`acknowledge_client_subcon`); an open client issue blocks activation.

## Hard product rules (do not break)

- No Forgot/Reset Password, no public Sign Up. Role comes from the account record only.
- No External Share Links.
- **No permanent deletes**: archive records, deactivate accounts. Keep history.
- Subcontractor contact is a local log only.
- Directory stores companies only (no individual workers). Manpower = count + XLS/XLSX lists.

## Rules for changes

- Every domain change needs a test in `tests/`. Run before finishing:
  ```sh
  pnpm test
  pnpm exec tsc --noEmit
  ```
- Keep the stored `State` shape backward-compatible. If you change it, add a migration in the load path in `App.tsx` (around line 96) or bump `STORAGE_KEY`, otherwise existing browser data breaks.
- Timers run client-side only (`processWorkflowTimers`) and only while the app is open. That is accepted for now.
- Per-type phases come from `PROJECT_PHASE_DEFINITIONS` (Residential 9, Commercial 9, Mixed-Use 12). `PHASES` / `DISCIPLINES` are legacy defaults.

## Do not touch (UI track)

Screen layout, styling and CSS (`src/*.tsx` visuals, `src/index.css`, `src/construction-daylight.css`). Only edit `.tsx` files where needed to call a new or changed command, and keep those edits minimal.

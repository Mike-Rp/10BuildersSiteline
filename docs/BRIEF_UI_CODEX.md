# SITELINE — UI brief (for Codex)

You are working on the **UI only**. Business logic is owned by a separate track (see "Do not touch").

## What SITELINE is

A role-based construction operations web app for 10 Builders Development and Construction Corporation. It is a **frontend-only, locally hosted** app: React 19 + TypeScript + Vite 8 + Tailwind CSS v4. There is no backend or database. All data is in the browser (localStorage, files in IndexedDB) and resets per browser.

Four roles, switched via the **Demo session** dropdown in the top bar (email/password login intentionally shows "not connected"):

| Role | Demo account | What they do |
|---|---|---|
| Administrator | Patricia N. Domingo | Creates projects (intake wizard) and accounts, company directory, rules, archive |
| Office PM | Renz D. Villaverde | Accepts projects, uploads 6 required docs, reviews progress/checklists, activates projects |
| Site PM | Karlo M. Espiritu, Rafael D. Mercado | **Mobile-first.** Accepts phase assignments, submits progress/photos/checklists. Lead Site PM handles subcontractors |
| Client | Ferdinand Uy | Read-only portal for their own projects |

## Run it

```sh
pnpm install
pnpm dev          # http://localhost:8443
pnpm test         # must stay green (66 tests)
pnpm exec tsc --noEmit
pnpm build
```

## UI files (yours)

| File | Contents |
|---|---|
| `src/App.tsx` (~3.8k lines) | App shell, sidebar, Admin + Office PM screens, intake wizard, modals |
| `src/RoleWorkspace.tsx` (~3.8k) | Site PM mobile views, OPM queues, project detail, document browser, directory |
| `src/LeadSubcontractorPanel.tsx` | Lead Site PM subcontractor allocation screen |
| `src/ClientPortal.tsx`, `src/ClientSubconReview.tsx` | Client portal |
| `src/panels.tsx` | Shared panels, SVG charts, activity, settings, tables |
| `src/ui.tsx` | Shared primitives: buttons, fields, modals, badges, file inputs |
| `src/LoginPage.tsx`, `src/PhaseTimeline.tsx`, `src/PlannedTimeline.tsx` | Login, timelines |
| `src/index.css`, `src/construction-daylight.css` | Global styles + design tokens (CSS variables at top of `construction-daylight.css`) |

## Design system

| Token | Value |
|---|---|
| Deep Navy (primary) | `#172B4D` |
| Steel Blue (links, secondary) | `#315A85` |
| Slate Blue (borders, accents) | `#647D9B` |
| Page background / Cards | `#F3F5F8` / `#FFFFFF` |
| Text primary / secondary | `#1F2937` / `#64748B` |
| Borders | `#D8E0E8` |
| Success / Warning / Danger | `#15803D` / `#B45309` / `#B42318` |

- Font: Inter. **Minimum text size 14px everywhere.**
- **Site PM screens: mobile-first, touch targets at least 48px.**
- Never show status by color alone; always add a label or icon.
- Some CSS variable names are legacy (`--green-dark`, `--green-soft`) but hold blue values. Keep the names.
- `docs/CONSTRUCTION_DAYLIGHT.md` has an outdated green palette. Ignore it; the CSS is correct.
- `tests/construction-daylight.test.mjs` checks font sizes and palette. Run `pnpm test` after style changes.

## How the UI talks to logic

Components never change project state directly. They build a `WorkflowCommand` (type in `src/workflows.ts`) and call `onCommand(command)` / `sendWorkflow(command)`, which returns `{ ok: true }` or `{ ok: false, error }`. Show `error` to the user. Every command carries `expectedVersion`; a stale version returns a conflict error that the UI shows as a banner.

To decide what to show (is a button enabled, is a step done), call the existing helpers in `workflows.ts` / `model.ts` / `client-access.ts` (for example `activationChecks`, `allocationReady`, `clientProjectViews`). Do not re-implement those rules in JSX.

## Hard product rules (UI must not break)

- No Forgot Password, Reset Password, or public Sign Up.
- Users can never pick or change their own role.
- No External Share Links.
- No permanent deletes. Use **Archive** (records) or **Deactivate** (accounts).
- Subcontractor "contact" only records a local log. Nothing is really emailed.
- The subcontractor directory lists **companies only**, no individual workers. Manpower = a total count + uploaded XLS/XLSX lists.

## Do not touch (logic track)

`src/model.ts`, `src/workflows.ts`, `src/client-access.ts`, `src/project-document-index.ts`, and `tests/`. If the UI needs new data or a new rule, describe what you need and leave a `// TODO(logic):` note instead of adding it yourself.

## Conventions

- Default-export components. Use double quotes for strings with apostrophes (an unescaped `'` in a single-quoted string breaks the build).
- `App.tsx` and `RoleWorkspace.tsx` are large. Splitting them into per-role/per-screen files is welcome; keep behavior identical.
- More detail: `docs/HANDOFF_FOR_CLAUDE_CODE.md`.

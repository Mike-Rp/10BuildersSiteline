# SITELINE ↔ Thesis-Backend ↔ Supabase

```
React app (this repo)  ──/api/v1──▶  Thesis-Backend (Express)  ──Postgres──▶  Supabase database
 src/api/*                           "SITELINE Backend/Thesis-Backend"        10BuildersDB
```

- The backend keeps its own login (bcrypt + JWT) and permissions. Supabase is used **only as its Postgres database**
  (Supabase Auth/Storage/Realtime are not used). Files live in the `stored_files` table, as the backend expects.
- Row Level Security is on for every table with no policies and the `anon`/`authenticated` roles have no privileges, so the
  public anon key can read nothing. The backend connects as the `postgres` role, which is unaffected.

## Setup
1. **Schema.** Supabase → SQL Editor → run `supabase/migrations/20261017000002_thesis_backend_schema.sql` once.
   It was generated from the backend's live database (52 tables) plus its migrations 003 and 004 (005 is "proposal only" and left out),
   seeds the lookup data (roles, disciplines, project types, the 7 stages, 26 checklist templates…), and removes the earlier
   Supabase-direct SITELINE schema if it is empty. It refuses to run twice or over a database that has users.
2. **Demo data (optional, development only).** Run `supabase/seed/dummy-data.sql`. All demo accounts use the password `Password@123`.
   It can be re-run (it replaces demo data, and refuses if any non-demo account exists).
3. **Backend `.env`** (`SITELINE Backend/Thesis-Backend/.env`) → point it at Supabase: Dashboard → **Connect → Session pooler**
   for host/port, then `DB_USER=postgres.<project-ref>`, `DB_NAME=postgres`, `DB_PASSWORD=<database password>`, `PGSSLMODE=no-verify`,
   `JWT_SECRET=<32+ random characters>`, and `CORS_ORIGINS` for production. Start it: `npm start` (port 3000).
4. **Frontend `.env.local`:** `VITE_API_URL=http://localhost:3000/api/v1`, then run Vite (`./node_modules/.bin/vite`, or `pnpm dev`
   after `pnpm approve-builds`). Without `VITE_API_URL` the app runs as the original local demo.

| Role | Demo login |
|---|---|
| Admin | `patricia.domingo@10builders.com` |
| Office PM | `renz.villaverde@10builders.com`, `lea.fernandez@10builders.com` |
| Site PM | `karlo.espiritu@`, `rafael.mercado@`, `mikaela.bautista@`, `diego.salvador@`, `bea.concepcion@10builders.com` (`jomar.reyes@` is suspended) |
| Client | `f.uy@aldenheights-hoa.com`, `maria.santos@rosariabiz.ph` |

## What works now (view-only)
Sign-in through `/auth/login`, session restore, and loading everything each role may see: accounts (admin) with licenses and
disciplines, projects with team, documents (downloadable), progress history, photos, notes, checklist, pending update,
subcontractor companies and notifications. Names for non-admin roles come from the projects. Progress is the backend's:
approved checklist items ÷ required items. A banner shows "Live data from the server · view only".

## Not done yet
**Saving.** Every action that changes data (accept an intake, upload a document, submit progress, add an account…) is blocked
with a "view-only" message, because the app's workflow engine (`src/workflows.ts`) and the backend's rules are different designs.
Each command has to be mapped to its endpoint (`/projects/intake`, `/confirmations/:id/accept`, `/projects/:id/phase-updates`,
`/projects/:id/documents/:typeId`, `/accounts` …) — see `SITELINE Backend/Thesis-Backend/files/*.md`.
Also missing: the Admin rule settings (grace/cap/response/idle) have no backend table and use defaults; first-login password reset
(`temp_password_issued`) has no screen.

## Tests
- `pnpm test` — unit tests plus `tests/api-backend.test.mjs`, which starts an in-process Postgres with this schema and the demo data,
  runs the real backend, and loads state for every role through the frontend's own client.
- `pnpm test:ui` — opens the real app in jsdom, signs in as each role and visits every page (needs the sibling backend folder).

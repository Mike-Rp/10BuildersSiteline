# SITELINE, Express and Supabase

The React frontend uses the Express backend in `Thesis-Backend/`. Express owns login, permissions and workflows, and connects directly to Supabase Postgres. Supabase Auth and Storage are not used. Runtime accounts, projects, companies, files, notifications and settings come from the API. Test fixtures stay under `tests/fixtures/`.

## Download the frontend and backend

The Express backend is included directly in this repository under `Thesis-Backend/`. A normal `git clone https://github.com/Mike-Rp/10BuildersSiteline.git` downloads both the frontend and backend; no submodule initialization or separate branch is needed. The imported backend source is the tested integration commit `5ada3cb66271055e6e7833b5af9fcc0c68b4ef7c` from `https://github.com/PransQT/Thesis-Backend.git`. Database credentials stay in the ignored local `Thesis-Backend/.env` file; copy `Thesis-Backend/.env.example` for a fresh checkout.

## Connect your database

1. Keep the existing database and records. For a brand new database only, first run `supabase/migrations/20261017000002_thesis_backend_schema.sql` in the Supabase SQL Editor. Do not rerun that initial schema over an existing database.
2. Set `Thesis-Backend/.env` using `Thesis-Backend/.env.example`. Get the session pooler host, port and username from Supabase's Connect dialog. Set `DB_SERVER`, `DB_PORT`, `DB_USER`, `DB_NAME`, `DB_PASSWORD`, `PGSSLMODE` and `JWT_SECRET`. Keep `API_URL=/api/v1` and `PORT=3000`.
3. From the repository root, install dependencies with `pnpm install` and `npm --prefix Thesis-Backend ci`.
4. Apply the additive integration migration to the database selected in the backend environment:
   `npm --prefix Thesis-Backend run db:integrate`.
   This creates workspace settings and metadata, subcontractor selections, file storage if missing, and optional project fields. It preserves users, projects, companies and workers, enables RLS on its tables, and can be rerun.
5. Run `npm run dev`. Open **http://localhost:8443**. Express runs at **http://localhost:3000/api/v1**. The launcher restarts the API when `Thesis-Backend/.env` changes; run the integration migration again after switching to a different database.
6. The frontend defaults to `http://localhost:3000/api/v1`. Override it with `VITE_API_URL` in `.env.local` if needed, then restart Vite.

Run the processes separately with `npm run dev:web` and `npm run dev:api`. Check the database connection at `http://localhost:3000/api/v1/health`.

## Accounts and optional test records

Accounts must exist in the selected database. The app does not create demo accounts during login. In the optional demo seed, Patricia's login is `patricia.domingo@10builders.com` / `Password@123`; other databases may contain different accounts.

For a disposable empty development database, `supabase/seed/dummy-data.sql` supplies the small connected demo. It replaces its demo records and refuses non-demo users. For the larger additive dataset, see [BULK-TEST-DATA.md](BULK-TEST-DATA.md): 5,000 workers, five companies, 50 admins, 120 OPMs, 120 SPMs and 50 linked projects. Neither seed is run automatically.

New manager assignments require an active account and a current uploaded PRC license. A license number alone is insufficient. Administrators can upload the license from the account screen. New accounts receive a temporary password and must replace it on first login.

New Client accounts use `@10builders.com` addresses. Saving a Client account creates an invited record; signing in remains blocked until a linked project completes intake and becomes active. Submitting intake, receiving confirmations or uploading some documents does not enable login. After activation, the Client can monitor only their authorized active or completed projects. Clients who already monitor an active project retain access while another project is in intake. Existing account addresses are not rewritten by this validation rule.

## Connected actions

Account creation and edits, client creation, license documents, intake submission, OPM and SPM confirmations, phase reassignment, registered documents, subcontractor suggestions and decisions, agreement review, activation, checklist evidence, progress submissions and approvals, notes, photos, notifications, rule settings, preferences and resignation records use API writes. The UI reloads saved server state before showing success.

Project activation checks registered documents, confirmations and subcontractor consent. Directory allocation uses actual available worker rows and runs in one transaction. Project progress comes from approved required checklist items. Retired requests containing manually entered percentages are retained in the database and do not appear in the current review queue.

Files are stored as database bytes and downloaded using the session token. Account documents are scoped to their account owner and administrators; project access and client visibility are checked on the server. General documents and evidence have a 10 MB limit; workforce spreadsheets have a 15 MB limit.

## Verification

- `npm test`: frontend unit tests, database seed checks and real Express API read/write tests against an isolated Postgres instance.
- `npm run test:ui`: signs into the real app as each role and visits its pages with an isolated backend.
- `node node_modules/typescript/bin/tsc --noEmit` and `npm run build`: type checking and production build.
- In `Thesis-Backend/`, `node --experimental-test-module-mocks --test tests/*.test.js` runs the existing backend regression suite.

Integration tests do not write to the configured live database. Archive maintenance runs only when `ARCHIVE_MAINTENANCE_ENABLED=true`.

## Initial loading performance

The frontend reads project data through one role-scoped `GET /workspace/project-data` request. The backend batches team, document, history, photo, note, checklist and review queries across the permitted project IDs. It returns metadata only; original file bytes remain behind the authenticated download endpoints. Administrators also reuse the account details already returned by the workspace endpoint.

A local measurement against the configured Supabase dataset (57 projects, 326 accounts and 11 companies) reduced login plus initial loading from 52.0 seconds and 523 HTTP requests to 4.6 seconds and 9 requests. Timing varies with database/network conditions. No user data is cached across accounts.

## Deploy the frontend and API together on Vercel

Deploy this repository's `main` branch with the repository root as Vercel's Root Directory. `vercel.json` installs both sets of dependencies, builds the frontend, and routes `/api/*` to the Express function in `api/index.js`. The function imports the shared app without opening a port or starting background timers. Local development still uses `npm run dev`.

In Vercel Project Settings ? Environment Variables, configure the backend's `DB_SERVER`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `PGSSLMODE`, and a strong `JWT_SECRET` for the deployment environment. Use your Supabase session pooler connection details. Keep `API_URL=/api/v1` and `ARCHIVE_MAINTENANCE_ENABLED=false`. Credentials are server-side variables and must never use a `VITE_` prefix. No local `.env` file is uploaded.

Production always uses `/api/v1` on the website's own HTTPS domain and ignores `VITE_API_URL`, so stale localhost or Supabase Auth URLs cannot redirect API requests. `VITE_API_URL` is only a local development override. Redeploy the latest commit to apply this behavior. Apply the integration database migration from a trusted local environment as described above; deployment does not migrate or seed the database.

After deployment, open `https://10builderssiteline.vercel.app/api/v1/health`. A 200 response with `{"ok":true,"database":true}` confirms that both the function and database work. A JSON 503 response means the function is running but database configuration or connectivity needs attention. A Vercel 404 means the API function was not deployed.

Vercel Functions limit request and response payloads to 4.5 MB, below this app's existing 10-15 MB upload limits. Larger files require a separate API host or a direct storage upload design. Legacy disk-backed upload endpoints also require adapting storage before using them on serverless hosting; the integrated workspace endpoints store file bytes in Postgres. Archive maintenance needs a scheduled service rather than the local server's background timer.

## Project-type phases

After loading the legacy schema and demo data, run `npm.cmd --prefix Thesis-Backend run db:project-types`. This installs the 9 Residential, 9 Commercial and 12 Mixed-Use phases and migrates existing projects. See [Project-type workflows](PROJECT-TYPE-WORKFLOWS.md) for migration mappings and assignment/checklist requirements.

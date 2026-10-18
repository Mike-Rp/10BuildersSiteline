# SITELINE bulk test data

Run [bulk-test-data.sql](../supabase/seed/bulk-test-data.sql) in the Supabase SQL Editor as `postgres`, after the Thesis-Backend schema migration.

On an empty installed schema, this dataset creates:

| Records | Count |
|---|---:|
| Subcontractor companies | 5 |
| Subcontractor workers | 5,000 (1,000 per company) |
| Administrators | 50 |
| Office PMs | 120 |
| Site PMs | 120 |
| Clients | 25 |
| Projects | 50 |

Workers are personnel records in `subcontractor_workers`, not login accounts. There are 315 login accounts in total. All identities, contact details, license numbers, documents and photos are synthetic.

## Import

1. If the schema is not installed, first run `supabase/migrations/20261017000002_thesis_backend_schema.sql`. Do not rerun the schema migration on an existing database.
2. Run the complete `supabase/seed/bulk-test-data.sql` file. The inserts run inside one atomic DO block. Run that complete block; the final verification queries also work separately.
3. The final queries list account counts, each company's workers, and all 50 projects with their OPM, lead SPM and client emails.
4. Connect the backend to that database and set the frontend's `VITE_API_URL` as described in [SUPABASE.md](SUPABASE.md). Sign out and sign in to reload server data.

This seed inserts missing rows using stable IDs. Running it again does not duplicate the dataset or reset edits. It does not truncate tables, remove accounts, overwrite existing records, disable audit triggers, or change permissions.

The numbers above describe this seed's records. If the original demo or other data already exists, it remains and the database totals will be larger (for example, 51 admins and 11 companies after the original 11-account/6-company demo). To get exactly these totals, use a separate empty test database with the installed schema and this seed alone. **Do not run the original `dummy-data.sql` after this seed:** that script refuses accounts outside its small demo and uses a destructive reset for its own demo.

## Logins

Every generated account uses **`Password@123`**.

| Role | Email range | First login |
|---|---|---|
| Admin | `admin001`–`admin050@siteline-test.example` | `admin001@siteline-test.example` |
| Office PM | `opm001`–`opm120@siteline-test.example` | `opm001@siteline-test.example` |
| Site PM | `spm001`–`spm120@siteline-test.example` | `spm001@siteline-test.example` |
| Client | `client001`–`client025@siteline-test.example` | `client001@siteline-test.example` |

The role and zero-padded number form the username before `@siteline-test.example`. For example, the last OPM is `opm120@siteline-test.example`. OPM/SPM licenses expire two years after the first import. Shared test credentials belong only in a test database.

## Connected scenarios

| Projects | Scenario | Relationships |
|---|---|---|
| 001–030 | Active, spread across all seven stages | 100 assigned workers each; all 5 companies supply 20 workers each |
| 031–035 | Sent to OPM | Pending confirmations and missing document placeholders |
| 036–040 | SPM review | OPM accepted, required intake documents uploaded, SPM confirmations pending |
| 041–045 | Draft | Client and admin linked; no confirmed team or crew |
| 046–050 | Completed / archived | All required checklist evidence approved, 100% progress, company assignments released |

For project number `N`:
- Its creator is `adminNNN`, and its assigned or suggested manager is `opmNNN` (drafts have no assigned OPM).
- The lead Site PM is numbered `2N - 1`; the other Site PM is `2N`. They cover the seven phase assignments, with discipline scopes derived from those phases.
- Its client number is `1 + ((N - 1) % 25)`, giving each client two projects.
- OPMs 051–120 and SPMs 101–120 start unassigned so you can test allocation. Draft projects 041–045 also leave their managers free.

Examples:
- **Cedar Heights Residential 001:** `admin001`, `opm001`, `spm001` + `spm002`, `client001`. Five companies and 100 actual worker records link to this project. A phase submission and evidence await review.
- **Harbor Point Commercial 002:** `opm002`, `spm003` + `spm004`, `client002`.
- **Cedar Heights Residential 031:** `opm031` can be used for an intake confirmation scenario.
- **Orchard Place Renovation 036:** `opm036` has accepted; `spm071` and `spm072` have pending assignments.
- **Orchard Place Infrastructure 046:** completed, 100% progress, linked to `client021`.

Each company has 600 assigned workers, 380 available active workers, and 20 inactive workers. Active assignment headcounts match the worker records' `current_project_id`; completed crews are released. Every worker has certification and past employment records.

Projects 001–005 have pending phase submissions with pending evidence, project 006 includes rejected evidence, and projects 007–011 have pending progress reviews. Active/completed projects include downloadable PDF documents, contracts, a synthetic one-pixel PNG photo, notes, checklist evidence and progress history. Notifications link staff to their projects. The seed's current progress and history use approved required items divided by all initialized required items.

The frontend remains in its existing **API view-only mode**. These records support reading and backend endpoint testing; importing them does not enable frontend saving. The frontend directory summarizes company manpower rather than exposing every worker as an individual login.

## Local verification

```powershell
node --test tests/bulk-seed.test.mjs
```

The test loads the real schema into an in-memory PostgreSQL database (PGlite). It checks counts, project/worker/manager links, crew totals, progress/evidence, file payloads, duplicate-free reimports, preservation of existing data, and rollback on a conflicting login. It does not connect to the hosted Supabase database.

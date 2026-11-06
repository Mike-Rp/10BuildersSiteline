// Starts the in-process Postgres + real backend, then runs the UI as each role.
import { spawn } from "node:child_process"
import fs from "node:fs"
import net from "node:net"
import { fileURLToPath } from "node:url"
import { PGlite } from "@electric-sql/pglite"
import { citext } from "@electric-sql/pglite/contrib/citext"
import { PGLiteSocketServer } from "@electric-sql/pglite-socket"

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const backend = here("../Thesis-Backend/")
const free = () => new Promise((r) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => r(port)) }) })

const db = new PGlite({ extensions: { citext } })
await db.exec("create role authenticated; create role anon; create role service_role; create schema extensions; create schema auth; create schema storage;")
await db.exec(fs.readFileSync(here("../supabase/migrations/20261017000002_thesis_backend_schema.sql"), "utf8").replace(/^create extension if not exists pgcrypto.*$/m, ""))
const migrate = (name) => db.exec(fs.readFileSync(here("../Thesis-Backend/migrations/"+name),"utf8"))
for(const migration of ["001-phase-checklists.sql","002-phase-update-confirmation.sql","003-react-integration.sql","004-verified-activity-progress.sql","016-user-id-numbers.sql","009-engineer-license-workflow.sql"]) await migrate(migration)
await db.exec(fs.readFileSync(here("../supabase/seed/dummy-data.sql"), "utf8"))
// Smoke runs exercise navigation, not license expiry: start every engineer from a valid, verified license.
await db.exec("update public.user_licenses set license_expiry = current_date + 400 where superseded_at is null")
await db.exec("delete from public.license_renewal_requests where file_ref like 'seed/licenses/renewal-%'")
for(const migration of ["008-monthly-report-history.sql","010-photo-release.sql","017-project-photo-review.sql","013-trade-subcontractor-allocation.sql","014-mixed-use-project-scope.sql"]) await migrate(migration)
const { installCredentialFixture } = await import("./helpers/credential-fixture.mjs")
await installCredentialFixture(db) // applies 015-engineer-credentials.sql
await migrate("018-phase-foreman-allocation.sql")
const dbPort = await free(), apiPort = await free()
const pg = new PGLiteSocketServer({ db, port: dbPort, host: "127.0.0.1" })
await pg.start()
const server = spawn(process.execPath, ["src/index.js"], { cwd: backend, stdio: "ignore", env: { ...process.env, NODE_ENV: "development", DB_SERVER: "127.0.0.1", DB_PORT: String(dbPort), DB_NAME: "postgres", DB_USER: "postgres", DB_PASSWORD: "x", DB_POOL_MAX: "1", PGSSLMODE: "disable", JWT_SECRET: "ui-smoke-secret-0123456789-0123456789", PORT: String(apiPort), HOST: "127.0.0.1", ARCHIVE_MAINTENANCE_ENABLED: "false" } })
for (let i = 0; i < 120; i++) { try { if ((await fetch(`http://127.0.0.1:${apiPort}/api/v1/health`)).ok) break } catch {} await new Promise((r) => setTimeout(r, 250)) }

const runs = [
  ["patricia.domingo@10builders.com", "Dashboard", "Active sites", "Project intake", "Documents", "Directory", "Team", "Archive", "Activity log", "Settings"],
  ["lea.fernandez@10builders.com", "Dashboard", "Confirmation queue", "Documents", "Active sites", "Archive", "Activity log", "Preferences"],
  ["karlo.espiritu@10builders.com", "Dashboard", "Active sites", "Resources", "Archive", "Activity log", "Preferences"],
  ["mikaela.bautista@10builders.com", "Dashboard", "Active sites", "Resources", "Archive", "Activity log", "Preferences"],
  ["f.uy@aldenheights-hoa.com", "Active sites", "Project Overview", "Project Documents", "Progress History", "Site"],
  ["maria.santos@rosariabiz.ph", "Active sites", "Project Overview", "Project Documents", "Progress History"],
]
const loginPath = (email) => email === "patricia.domingo@10builders.com" ? "/admin/login" : email.endsWith("@10builders.com") ? "/staff/login" : "/"
let failed = false
for (const [email, ...labels] of runs.filter(([e]) => !process.argv[2] || e.startsWith(process.argv[2]))) {
  const out = await new Promise((resolve) => {
    let buf = ""
    const child = spawn(process.execPath, ["--experimental-strip-types", "tests/ui-run.mjs", email, ...labels], { cwd: here("../"), env: { ...process.env, VITE_API_URL: `http://127.0.0.1:${apiPort}/api/v1`, NODE_ENV: "development", SMOKE_LOGIN_PATH: loginPath(email) } })
    child.stdout.on("data", (d) => (buf += d))
    child.stderr.on("data", (d) => (buf += "STDERR " + d))
    child.on("close", () => resolve(buf))
  })
  const line = out.split("\n").find((l) => l.startsWith("RESULT "))
  if (!line) { failed = true; console.log("\n" + email + ": NO RESULT\n" + out.slice(-1800)); continue }
  const r = JSON.parse(line.slice(7))
  const bad = Object.entries(r.pages).filter(([, v]) => v !== "ok")
  if (r.problems.length || bad.length) failed = true
  console.log(`\n${email}\n  signed in: ${r.signedIn}  banner: ${r.banner}\n  home: ${r.home}\n  pages: ${JSON.stringify(r.pages)}\n  problems: ${r.problems.length ? "\n    " + r.problems.join("\n    ") : "none"}`)
}
server.kill()
await pg.stop()
await db.close()
process.exit(failed ? 1 : 0)

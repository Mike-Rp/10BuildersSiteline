import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import net from "node:net"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { PGlite } from "@electric-sql/pglite"
import { citext } from "@electric-sql/pglite/contrib/citext"
import { PGLiteSocketServer } from "@electric-sql/pglite-socket"
const here = (p) => fileURLToPath(new URL(p, import.meta.url)),
  read = (p) => fs.readFileSync(here(p), "utf8")
const free = () =>
  new Promise((resolve) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const p = s.address().port
      s.close(() => resolve(p))
    })
  })

test(
  "Admin offline recovery is single-use, atomic, rate-limited and independent of external messaging",
  { timeout: 120000 },
  async (t) => {
    const db = new PGlite({ extensions: { citext } })
    let socket,
      child,
      token = "",
      currentPassword = "Password@123"
    t.after(async () => {
      if (child && child.exitCode === null && child.signalCode === null) {
        const closed = new Promise((resolve) => child.once("exit", resolve))
        child.kill()
        await closed
      }
      if (socket) await socket.stop()
      await db.close()
    })
    await db.exec(
      "create role authenticated;create role anon;create role service_role;create schema extensions;create schema auth;create schema storage;",
    )
    await db.exec(
      read(
        "../supabase/migrations/20261017000002_thesis_backend_schema.sql",
      ).replace(/^create extension if not exists pgcrypto.*$/m, ""),
    )
    for (const file of [
      "001-phase-checklists.sql",
      "002-phase-update-confirmation.sql",
      "003-react-integration.sql",
      "004-verified-activity-progress.sql",
      "009-engineer-license-workflow.sql",
      "015-engineer-credentials.sql",
      "011-independent-notifications.sql",
    ])
      await db.exec(read("../Thesis-Backend/migrations/" + file))
    await db.exec(read("../supabase/seed/dummy-data.sql"))
    const admin = (
      await db.query(
        "select id,email from users where email='patricia.domingo@10builders.com'",
      )
    ).rows[0]
    const dbPort = await free(),
      apiPort = await free()
    socket = new PGLiteSocketServer({ db, port: dbPort, host: "127.0.0.1" })
    await socket.start()
    child = spawn(process.execPath, ["src/index.js"], {
      cwd: here("../Thesis-Backend/"),
      windowsHide: true,
      stdio: "ignore",
      env: {
        ...process.env,
        NODE_ENV: "development",
        DB_SERVER: "127.0.0.1",
        DB_PORT: String(dbPort),
        DB_NAME: "postgres",
        DB_USER: "postgres",
        DB_PASSWORD: "x",
        DB_POOL_MAX: "1",
        PGSSLMODE: "disable",
        JWT_SECRET: "recovery-isolated-tests-only-0123456789",
        HOST: "127.0.0.1",
        PORT: String(apiPort),
        ARCHIVE_MAINTENANCE_ENABLED: "false",
      },
    })
    const base = `http://127.0.0.1:${apiPort}/api/v1`,
      deadline = Date.now() + 25000
    while (true) {
      try {
        if ((await fetch(base + "/health")).ok) break
      } catch {}
      if (child.exitCode !== null || Date.now() > deadline)
        throw Error("Test backend did not start")
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    async function request(path, body, auth = token) {
      const response = await fetch(base + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(auth ? { Authorization: "Bearer " + auth } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      return {
        status: response.status,
        body: await response.json(),
        headers: response.headers,
      }
    }
    async function login(password = currentPassword) {
      const r = await request(
        "/auth/admin/login",
        { email: admin.email, password, replace_session: true },
        "",
      )
      assert.equal(r.status, 200, r.body.message)
      token = r.body.data.token
      return token
    }
    const generate = () =>
      request("/auth/admin/recovery-codes", { currentPassword })
    const verify = (code, email = admin.email) =>
      request("/auth/admin/recovery/verify", { email, code }, "")
    const reset = (resetToken, password) =>
      request("/auth/admin/recovery/reset", { resetToken, password }, "")
    const summary = async () => {
      const r = await request("/auth/admin/recovery-codes")
      assert.equal(r.status, 200, r.body.message)
      return r.body.data
    }
    const ageLimits = () =>
      db.exec(
        "update admin_recovery_attempts set window_started_at=now()-interval '16 minutes'",
      )
    await login()
    assert.equal(
      (await request("/auth/admin/recovery-codes")).status,
      503,
      "unconfigured recovery fails closed",
    )
    const migration = read(
      "../Thesis-Backend/migrations/021-admin-recovery-codes.sql",
    )
    await db.exec(migration)
    await db.exec(migration)
    await db.exec("set role anon")
    for (const table of [
      "admin_recovery_codes",
      "admin_recovery_sets",
      "admin_recovery_challenges",
      "admin_recovery_attempts",
    ])
      await assert.rejects(
        db.query(`select * from ${table}`),
        (e) => e.code === "42501",
      )
    await db.exec("reset role")
    assert.equal(
      (await request("/auth/admin/recovery-codes", undefined, "")).status,
      401,
    )
    const staff = (
      await request(
        "/auth/staff/login",
        {
          email: "karlo.espiritu@10builders.com",
          password: "Password@123",
          replace_session: true,
        },
        "",
      )
    ).body.data.token
    assert.equal(
      (await request("/auth/admin/recovery-codes", undefined, staff)).status,
      403,
    )
    assert.equal(
      (
        await request(
          "/auth/admin/recovery-codes",
          { currentPassword: "Password@123" },
          staff,
        )
      ).status,
      403,
    )
    assert.equal((await summary()).configured, false)
    assert.equal(
      (
        await request("/auth/admin/recovery-codes", {
          currentPassword: "wrong-password",
        })
      ).status,
      422,
    )
    let generated = await generate()
    assert.equal(generated.status, 201, generated.body.message)
    const first = generated.body.data.codes
    assert.equal(first.length, 5)
    assert.equal(new Set(first.map((c) => c.code)).size, 5)
    assert.ok(
      first.every((c) => /^[A-F0-9]{8}(?:-[A-F0-9]{8}){3}$/.test(c.code)),
    )
    const stored = (
      await db.query("select code_hash from admin_recovery_codes")
    ).rows
    assert.ok(stored.every((c) => /^[a-f0-9]{64}$/.test(c.code_hash)))
    assert.ok(
      !JSON.stringify(stored).includes(first[0].code.replaceAll("-", "")),
    )
    let status = await summary()
    assert.equal(status.remaining, 5)
    assert.equal(status.used, 0)
    assert.equal(status.refreshRequired, false)
    assert.ok(!JSON.stringify(status).includes(first[0].code))
    assert.ok(!JSON.stringify(status).includes("code_hash"))
    const wrongAccount = await verify(first[0].code, "unknown@example.test"),
      wrongCode = await verify("00000000-00000000-00000000-00000000")
    assert.equal(wrongAccount.status, 401)
    assert.equal(
      wrongAccount.body.message,
      wrongCode.body.message,
      "unknown accounts and invalid codes use the same response",
    )
    let proof = await verify(first[0].code.toLowerCase())
    assert.equal(proof.status, 200)
    assert.equal(
      (await request("/accounts", undefined, proof.body.data.resetToken))
        .status,
      401,
      "a reset ticket cannot act as a login session",
    )
    assert.equal(
      (await summary()).used,
      0,
      "verification alone does not consume a code",
    )
    await db.exec(
      "update admin_recovery_challenges set created_at=now()-interval '10 minutes',expires_at=now()-interval '9 minutes'",
    )
    assert.equal(
      (await reset(proof.body.data.resetToken, "RecoveredPassword@123")).status,
      401,
    )
    proof = await verify(first[0].code)
    assert.equal(proof.status, 200)
    assert.equal((await reset(proof.body.data.resetToken, "short")).status, 422)
    assert.equal(
      (await summary()).used,
      0,
      "an invalid password does not consume the code",
    )
    const otherProof = await verify(first[0].code)
    assert.equal(otherProof.status, 200)
    const passwords = ["RecoveredPassword@123", "OtherPassword@123"]
    const simultaneous = await Promise.all([
      reset(proof.body.data.resetToken, passwords[0]),
      reset(otherProof.body.data.resetToken, passwords[1]),
    ])
    assert.deepEqual(
      simultaneous.map((r) => r.status).sort(),
      [200, 401],
      "one successful password reset per code",
    )
    currentPassword = passwords[simultaneous.findIndex((r) => r.status === 200)]
    assert.equal(
      (await request("/auth/session")).status,
      401,
      "recovery ends the existing session",
    )
    assert.equal(
      (await verify(first[0].code)).status,
      401,
      "a used code cannot create another reset ticket",
    )
    assert.equal(
      (await reset(proof.body.data.resetToken, "ReplayPassword@123")).status,
      401,
    )
    await login()
    status = await summary()
    assert.equal(status.remaining, 4)
    assert.equal(status.used, 1)
    assert.equal(status.refreshRequired, true)
    assert.equal(status.codes[0].state, "used")
    assert.ok(status.codes[0].usedAt)
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from notifications where recipient_user_id=$1 and subject_type='admin_recovery' and resolved_at is null",
          [admin.id],
        )
      ).rows[0].n,
      1,
    )
    assert.equal(
      (
        await request("/auth/reset-password", {
          password: "BypassPassword@123",
        })
      ).status,
      403,
      "legacy reset cannot bypass current-password verification for a normal admin",
    )
    assert.equal(
      (
        await request("/auth/admin/change-password", {
          currentPassword: "wrong-password",
          password: "ChangedPassword@123",
        })
      ).status,
      422,
    )
    assert.equal(
      (
        await request("/auth/admin/change-password", {
          currentPassword,
          password: currentPassword,
        })
      ).status,
      422,
    )
    assert.equal(
      (
        await request("/auth/admin/change-password", {
          currentPassword,
          password: "ChangedPassword@123",
        })
      ).status,
      200,
    )
    currentPassword = "ChangedPassword@123"
    assert.equal((await request("/auth/session")).status, 401)
    await login()
    generated = await generate()
    assert.equal(generated.status, 201)
    const second = generated.body.data.codes
    status = await summary()
    assert.equal(status.refreshRequired, false)
    assert.equal(status.remaining, 5)
    assert.equal(status.used, 0)
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from notifications where recipient_user_id=$1 and subject_type='admin_recovery' and resolved_at is null",
          [admin.id],
        )
      ).rows[0].n,
      0,
      "replacement resolves the refresh notification",
    )
    assert.equal(
      (await verify(first[1].code)).status,
      401,
      "unused codes from an old set are revoked",
    )
    await ageLimits()
    proof = await verify(second[0].code)
    assert.equal(proof.status, 200)
    generated = await generate()
    assert.equal(generated.status, 201)
    assert.equal(
      (await reset(proof.body.data.resetToken, "OldChallenge@123")).status,
      401,
      "regeneration invalidates outstanding reset tickets",
    )
    const third = generated.body.data.codes
    for (let i = 0; i < 5; i++) {
      proof = await verify(third[i].code)
      assert.equal(proof.status, 200, proof.body.message)
      currentPassword = `ExhaustionPassword@${i}`
      assert.equal(
        (await reset(proof.body.data.resetToken, currentPassword)).status,
        200,
      )
    }
    await login()
    status = await summary()
    assert.equal(status.remaining, 0)
    assert.equal(status.used, 5)
    assert.equal(status.refreshRequired, true)
    assert.ok(status.codes.every((c) => c.state === "used"))
    generated = await generate()
    assert.equal(
      generated.status,
      201,
      "an authenticated admin can replenish an exhausted set",
    )
    const fourth = generated.body.data.codes
    await ageLimits()
    proof = await verify(fourth[0].code)
    assert.equal(proof.status, 200)
    const before = (
      await db.query("select password_hash from users where id=$1", [admin.id])
    ).rows[0].password_hash
    await db.exec(
      `create function fail_recovery_audit() returns trigger language plpgsql as $$begin if new.new_values->>'_archive_event'='recovery_code_used' then raise exception 'Simulated audit outage';end if;return new;end$$;create trigger fail_recovery_audit before insert on audit_log for each row execute function fail_recovery_audit();`,
    )
    assert.equal(
      (await reset(proof.body.data.resetToken, "RollbackPassword@123")).status,
      500,
    )
    assert.equal(
      (await summary()).used,
      0,
      "reset rollback preserves the unused code and current session",
    )
    assert.equal(
      (
        await db.query("select password_hash from users where id=$1", [
          admin.id,
        ])
      ).rows[0].password_hash,
      before,
    )
    await db.exec(
      "drop trigger fail_recovery_audit on audit_log;drop function fail_recovery_audit()",
    )
    assert.equal(
      (await reset(proof.body.data.resetToken, "FinalPassword@123")).status,
      200,
    )
    currentPassword = "FinalPassword@123"
    await login()
    await ageLimits()
    for (let i = 0; i < 8; i++)
      assert.equal(
        (await verify("00000000-00000000-00000000-00000000")).status,
        401,
      )
    const limited = await verify(fourth[1].code)
    assert.equal(limited.status, 429)
    assert.ok(limited.headers.get("Retry-After"))
    assert.equal(
      (await verify(fourth[1].code)).status,
      429,
      "failed attempts persist despite rejection transactions",
    )
    await login()
    assert.equal(
      (await summary()).remaining,
      4,
      "recovery limits do not disable normal sign-in",
    )
    const audit = JSON.stringify(
      (
        await db.query(
          "select new_values from audit_log where table_name like 'admin_recovery%' or new_values->>'_archive_event'='admin_password_changed'",
        )
      ).rows,
    )
    assert.ok(
      !audit.includes(fourth[0].code) && !audit.includes(currentPassword),
      "audit records contain metadata, not recovery secrets or passwords",
    )
    await db.query("update users set temp_password_issued=true where id=$1", [
      admin.id,
    ])
    assert.equal(
      (
        await request("/auth/reset-password", {
          password: "InitialChosenPassword@123",
        })
      ).status,
      200,
      "temporary-password first-login setup remains available",
    )
    assert.equal(
      (
        await db.query("select temp_password_issued from users where id=$1", [
          admin.id,
        ])
      ).rows[0].temp_password_issued,
      false,
    )
    assert.equal(
      (
        await request("/auth/reset-password", {
          password: "AnotherBypassPassword@123",
        })
      ).status,
      403,
    )
    currentPassword = "InitialChosenPassword@123"
    await login()
  },
)

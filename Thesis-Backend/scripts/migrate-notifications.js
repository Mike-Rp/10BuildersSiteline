import process from "node:process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { assertLocalDatabase } from "./migrate-verified-progress.js";

export async function migrateNotifications(db, { apply = false, validate } = {}) {
  await db.query("BEGIN");
  try {
    await db.query("SELECT pg_advisory_xact_lock(hashtext('siteline-independent-notifications-v1'))");
    // Prevent concurrent legacy inserts/reads from escaping the migration snapshot.
    await db.query("LOCK TABLE public.notification_recipients IN SHARE ROW EXCLUSIVE MODE");
    const before = (await db.query(`SELECT
      (SELECT count(*)::int FROM activity_log) AS activity_rows,
      (SELECT count(*)::int FROM audit_log) AS audit_rows,
      (SELECT count(*)::int FROM notification_recipients) AS legacy_rows`)).rows[0];
    const sql = await readFile(new URL("../migrations/011-independent-notifications.sql", import.meta.url), "utf8");
    if (db.exec) await db.exec(sql); else await db.query(sql);
    const summary = (await db.query(`SELECT count(*)::int AS legacy_rows,
      count(x.id)::int AS mapped_rows,
      count(*) FILTER (WHERE x.id IS NULL)::int AS missing_rows,
      count(*) FILTER (WHERE x.legacy_snapshot->'is_read' IS DISTINCT FROM to_jsonb(n.is_read)
        OR x.legacy_snapshot->'read_at' IS DISTINCT FROM coalesce(to_jsonb(n.read_at),'null'::jsonb))::int AS source_read_state_differences,
      count(*) FILTER (WHERE x.title IS DISTINCT FROM a.title OR x.message IS DISTINCT FROM coalesce(a.detail,''))::int AS current_text_differences
      FROM notification_recipients n JOIN activity_log a ON a.id=n.activity_log_id
      LEFT JOIN notifications x ON x.recipient_user_id=n.recipient_user_id AND x.legacy_key='activity:'||a.id`)).rows[0];
    const after = (await db.query(`SELECT
      (SELECT count(*)::int FROM activity_log) AS activity_rows,
      (SELECT count(*)::int FROM audit_log) AS audit_rows,
      (SELECT count(*)::int FROM notification_recipients) AS legacy_rows,
      (SELECT count(*)::int FROM notifications) AS notification_rows,
      (SELECT count(*)::int FROM pg_trigger WHERE tgrelid='public.notification_recipients'::regclass
        AND tgname='trg_audit_notification_recipients' AND NOT tgisinternal) AS legacy_audit_triggers`)).rows[0];
    if (summary.missing_rows || before.activity_rows !== after.activity_rows || before.audit_rows !== after.audit_rows || before.legacy_rows !== after.legacy_rows)
      throw new Error("Notification migration preservation check failed.");
    // A test can exercise the new schema inside this same transaction; dry runs still roll back.
    if (validate) await validate(db);
    await db.query(apply ? "COMMIT" : "ROLLBACK");
    return { mode: apply ? "applied" : "dry-run (rolled back)", before, after, ...summary };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let pool;
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || args.some(arg => !["--dry-run", "--apply"].includes(arg))) throw new Error("Use --dry-run or --apply.");
    const dotenv = await import("dotenv");
    dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
    assertLocalDatabase(process.env.DB_SERVER); // Before importing the pool or connecting; no hosted override.
    const { default: pg } = await import("pg");
    pool = new pg.Pool({ host: process.env.DB_SERVER, port: Number(process.env.DB_PORT || 5432), database: process.env.DB_NAME,
      user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: false, max: 1, connectionTimeoutMillis: 10000 });
    const client = await pool.connect();
    try { console.log(JSON.stringify(await migrateNotifications(client, { apply: args.includes("--apply") }), null, 2)); }
    finally { client.release(); }
  } catch (error) {
    console.error(error.code ? `Local notification migration failed (${error.code}).` : error.message);
    process.exitCode = 1;
  } finally { await pool?.end(); }
}

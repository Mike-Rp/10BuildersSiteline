// Copies files that are stored inside the database (bytea) into the private Supabase
// Storage buckets. Run migration 028 first, and set SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY.
//
//   npm run db:files-to-storage                      dry run: counts what would move, changes nothing
//   npm run db:files-to-storage -- --apply           copies up to --limit files (default 25) and records where they went
//   npm run db:files-to-storage -- --release         empties the database copy of files already verified in Storage
//
// --apply never deletes anything: the database bytes stay, so it can be re-run or abandoned.
// --release is the only step that removes database bytes. It re-checks each object in
// Storage first and skips any file that does not match. Take a backup before --release.
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { get, close } from "../src/common/pool-manager.js";
import { STORAGE_BUCKETS } from "../src/services/storage/storage-plan.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const release = args.includes("--release");
const limit = Number(args[args.indexOf("--limit") + 1]) > 0 && args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : 25;
const local = ["localhost", "127.0.0.1", "::1"].includes(process.env.DB_SERVER || "");
if ((apply || release) && !local && process.env.CONFIRM_BACKUP !== "yes") {
    console.error("Refusing to change a non-local database. Take a backup, then set CONFIRM_BACKUP=yes.");
    process.exit(1);
}
if ((apply || release) && !(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(1);
}

const EXTENSIONS = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" };
const storage = apply || release
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }).storage
    : null;

// Which bucket a stored_files row belongs in. Manpower spreadsheets are skipped: that feature was removed.
function bucketFor(table, row) {
    if (!EXTENSIONS[row.content_type]) return null;
    if (table === "project_phase_files") return STORAGE_BUCKETS.evidence;
    if (row.purpose === "manpower") return null;
    if (row.purpose === "photo") return row.content_type.startsWith("image/") ? STORAGE_BUCKETS.photo : STORAGE_BUCKETS.document;
    if (row.purpose === "account") return STORAGE_BUCKETS.credential;
    return STORAGE_BUCKETS.document;
}

async function objectSize(bucket, path) {
    const slash = path.lastIndexOf("/");
    const { data, error } = await storage.from(bucket).list(path.slice(0, slash), { limit: 10, search: path.slice(slash + 1) });
    if (error) throw error;
    const found = data.find(object => object.name === path.slice(slash + 1));
    return found ? Number(found.metadata?.size) : null;
}

const client = await (await get()).connect();
const TABLES = [
    { table: "stored_files", owner: "uploaded_by", columns: "id,purpose,content_type,byte_size,uploaded_by" },
    { table: "project_phase_files", owner: "uploaded_by", columns: "id,content_type,byte_size,uploaded_by" },
];
try {
    const ready = (await client.query(`select count(*)::int as n from information_schema.columns where table_schema='public'
        and table_name in ('stored_files','project_phase_files') and column_name in ('storage_bucket','storage_path')`)).rows[0].n === 4;
    if (!ready) throw new Error("Apply migration 028-storage-backed-files.sql first.");
    console.log(`${release ? "RELEASING" : apply ? "COPYING" : "DRY RUN"} on database ${process.env.DB_NAME || ""} (${process.env.DB_SERVER || ""})`);
    const summary = {};
    let copied = 0, released = 0, failed = 0;
    for (const { table, columns } of TABLES) {
        const rows = (await client.query(release
            ? `select ${columns},storage_bucket,storage_path from public.${table} where content is not null and storage_path is not null order by id`
            : `select ${columns} from public.${table} where content is not null and storage_path is null order by id`)).rows;
        for (const row of rows) {
            const bucket = release ? row.storage_bucket : bucketFor(table, row);
            const key = `${table} -> ${bucket || "SKIPPED (type or purpose not supported)"}`;
            summary[key] ??= { files: 0, bytes: 0 };
            if (!bucket) { summary[key].files++; continue; }
            if (!release && copied >= limit && apply) continue;
            summary[key].files++; summary[key].bytes += Number(row.byte_size);
            if (!apply && !release) continue;
            try {
                if (release) {
                    if (await objectSize(bucket, row.storage_path) !== Number(row.byte_size)) throw new Error("object missing or size differs");
                    await client.query(`update public.${table} set content=null where id=$1 and storage_path is not null`, [row.id]);
                    released++;
                    continue;
                }
                const path = `${row.uploaded_by}/${row.id}.${EXTENSIONS[row.content_type]}`;
                const { content } = (await client.query(`select content from public.${table} where id=$1`, [row.id])).rows[0];
                const { error } = await storage.from(bucket).upload(path, content, { contentType: row.content_type, upsert: false });
                if (error && !/exists|duplicate/i.test(error.message)) throw error;
                if (await objectSize(bucket, path) !== Number(row.byte_size)) throw new Error("stored size does not match");
                await client.query(`update public.${table} set storage_bucket=$2,storage_path=$3 where id=$1 and storage_path is null`, [row.id, bucket, path]);
                copied++;
            } catch (error) {
                failed++;
                console.error(`FAILED ${table} ${row.id}: ${error.message}`);
            }
        }
    }
    for (const [key, { files, bytes }] of Object.entries(summary)) console.log(`${key}: ${files} files, ${(bytes / 1048576).toFixed(1)} MB`);
    if (apply) console.log(`Copied ${copied}; failed ${failed}. Re-run to continue; database bytes were kept.`);
    else if (release) console.log(`Released ${released}; failed ${failed}.`);
    else console.log("Dry run only. Nothing was changed. Add --apply to copy.");
} finally {
    client.release();
    await close();
}

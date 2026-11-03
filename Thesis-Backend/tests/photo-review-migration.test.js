import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("photo review migration preserves existing visibility and adds constrained review state", { timeout: 30000 }, async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create table public.users(id uuid primary key);
    create table public.project_photos(
      id bigint generated always as identity primary key,
      is_client_visible boolean not null default false
    );
    insert into public.users values ('11111111-1111-4111-8111-111111111111');
    insert into public.project_photos(is_client_visible) values (false),(true);
  `);
  const sql = await readFile(new URL("../migrations/017-project-photo-review.sql", import.meta.url), "utf8");
  await db.exec(sql);

  const rows = (await db.query("select is_client_visible,review_status,review_note,reviewed_by,reviewed_at from public.project_photos order by id")).rows;
  assert.deepEqual(rows.map(row => [row.is_client_visible, row.review_status]), [[false, "pending"], [true, "released"]]);
  assert.equal(rows[0].review_note, null);
  assert.equal(rows[1].reviewed_by, null);

  await assert.rejects(db.query("update public.project_photos set review_status='unknown' where id=1"), /project_photos_review_status_check/);
  await db.exec(sql);
  assert.equal((await db.query("select count(*)::int as total from public.project_photos")).rows[0].total, 2);
});

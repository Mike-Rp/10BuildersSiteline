import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpError } from "../src/common/utilities/access.utility.js";
import { reviewSitePhoto } from "../src/services/workspace/site-photo-review.utility.js";

const photoId = "44444444-4444-4444-8444-444444444444";
const project = { id: "11111111-1111-4111-8111-111111111111", suggested_opm_id: "22222222-2222-4222-8222-222222222222" };
const opm = { id: project.suggested_opm_id, role: "opm" };

function photoDb(photo = { id: photoId, uploaded_by: "33333333-3333-4333-8333-333333333333", caption: "Foundation pour" }) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
      if (sql.startsWith("select id,uploaded_by,caption")) return { rows: photo ? [photo] : [], rowCount: photo ? 1 : 0 };
      if (sql.startsWith("update project_photos")) return { rows: [], rowCount: 1 };
      throw new Error("Unexpected photo review query: " + sql);
    },
  };
}

test("only assigned OPM and Admin can review project photos", async () => {
  const db = photoDb();
  await assert.rejects(reviewSitePhoto(db, { ...opm, id: "55555555-5555-4555-8555-555555555555" }, project, { type: "release_photo", photoId }),
    error => error instanceof HttpError && error.status === 403);
  await assert.rejects(reviewSitePhoto(db, { id: "33333333-3333-4333-8333-333333333333", role: "spm" }, project, { type: "release_photo", photoId }),
    error => error instanceof HttpError && error.status === 403);
  assert.equal(db.calls.length, 0);
});

test("reject requires a reason, keeps photo internal, and returns it to the uploader", async () => {
  const db = photoDb();
  await assert.rejects(reviewSitePhoto(db, opm, project, { type: "reject_photo", photoId, note: "  " }),
    error => error instanceof HttpError && error.status === 400);
  assert.equal(db.calls.some(call => call.sql.startsWith("update project_photos")), false);

  const result = await reviewSitePhoto(db, opm, project, { type: "reject_photo", photoId, note: "Unrelated to this project" });
  assert.equal(result.title, "Site photo returned for changes");
  assert.deepEqual(result.recipientIds, ["33333333-3333-4333-8333-333333333333"]);
  const update = db.calls.find(call => call.sql.startsWith("update project_photos"));
  assert.match(update.sql, /review_status='rejected'.*is_client_visible=false/);
  assert.equal(update.params[2], "Unrelated to this project");
});

test("release records reviewer and makes the photo client-visible", async () => {
  const db = photoDb();
  const result = await reviewSitePhoto(db, opm, project, { type: "release_photo", photoId });
  assert.equal(result.title, "Site photo released to client");
  const update = db.calls.find(call => call.sql.startsWith("update project_photos"));
  assert.match(update.sql, /review_status='released'.*is_client_visible=true.*released_by=.*released_at/);
  assert.equal(update.params[2], opm.id);
});

test("already reviewed or cross-project photos cannot be decided", async () => {
  const db = photoDb(null);
  await assert.rejects(reviewSitePhoto(db, opm, project, { type: "release_photo", photoId }),
    error => error instanceof HttpError && error.status === 404);
});

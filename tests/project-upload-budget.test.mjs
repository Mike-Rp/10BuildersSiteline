import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { assertProjectUploadBudget, linkProjectFile, PER_FILE_UPLOAD_LIMIT } from "../Thesis-Backend/src/services/workspace/project-upload-budget.utility.js";

test("each upload may be up to 10 MB regardless of what the project already holds", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table projects(id text primary key);
      create table stored_files(id text primary key,project_id text,byte_size integer,purpose text);
      create table project_phase_files(project_id text,byte_size integer);
      insert into projects values('a'),('b');
      insert into stored_files values('old','a',4194304,'photo'),('big',null,10485760,'upload'),('toobig',null,10485761,'upload');
      insert into project_phase_files values('a',9437184);`);
    await assertProjectUploadBudget(db, "a", PER_FILE_UPLOAD_LIMIT); // Exactly 10 MB fits even with 13+ MB already stored.
    await assert.rejects(assertProjectUploadBudget(db, "a", PER_FILE_UPLOAD_LIMIT + 1), /Each upload may be up to 10 MB/);
    await linkProjectFile(db, "a", "big", "photo");
    assert.equal((await db.query("select project_id from stored_files where id='big'")).rows[0].project_id, "a");
    await assert.rejects(linkProjectFile(db, "b", "big", "photo"), /another project/);
    await assert.rejects(linkProjectFile(db, "b", "toobig", "photo"), /Each upload may be up to 10 MB/);
    assert.equal((await db.query("select project_id from stored_files where id='toobig'")).rows[0].project_id, null);
  } finally { await db.close(); }
});

test("documents link without the photo size check", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table projects(id text primary key);
      create table stored_files(id text primary key,project_id text,byte_size integer,purpose text);
      create table project_phase_files(project_id text,byte_size integer);
      insert into projects values('a');
      insert into stored_files values('doc1',null,9437184,'upload'),('doc2',null,9437184,'upload');`);
    await linkProjectFile(db, "a", "doc1");
    await linkProjectFile(db, "a", "doc2", "document");
  } finally { await db.close(); }
});

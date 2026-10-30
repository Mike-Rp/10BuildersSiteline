import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { assertProjectUploadBudget, linkProjectFile, PROJECT_UPLOAD_LIMIT } from "../Thesis-Backend/src/services/workspace/project-upload-budget.utility.js";

test("project budget combines both stores, retained files, and later uploads", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table projects(id text primary key);
      create table stored_files(id text primary key,project_id text,byte_size integer,purpose text);
      create table project_phase_files(project_id text,byte_size integer);
      insert into projects values('a'),('b');
      insert into stored_files values('old','a',4194304,'document'),('new',null,1048576,'upload'),('overflow',null,1,'upload');
      insert into project_phase_files values('a',5242880);`);
    await linkProjectFile(db, "a", "new"); // Exactly 10 MB.
    await linkProjectFile(db, "a", "new"); // Same file is not charged twice.
    await assert.rejects(linkProjectFile(db, "a", "overflow"), /10 MB total.*0 bytes/);
    assert.equal((await db.query("select project_id from stored_files where id='overflow'")).rows[0].project_id, null);
    await linkProjectFile(db, "b", "overflow"); // Independent project allowance.
    await assert.rejects(linkProjectFile(db, "b", "new"), /another project/);
    await assert.rejects(assertProjectUploadBudget(db, "a", 1), /10 MB total/);
    await assertProjectUploadBudget(db, "b", PROJECT_UPLOAD_LIMIT - 1);
    await assert.rejects(assertProjectUploadBudget(db, "b", PROJECT_UPLOAD_LIMIT), /10 MB total/);
    await db.query("insert into project_phase_files values('a',1)"); // Legacy over-limit project remains readable.
    await linkProjectFile(db, "a", "new");
    await assert.rejects(assertProjectUploadBudget(db, "a", 1), /0 bytes/);
  } finally { await db.close(); }
});

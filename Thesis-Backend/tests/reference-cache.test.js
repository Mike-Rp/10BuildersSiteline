import assert from "node:assert/strict";
import test from "node:test";
import { createReferenceCache } from "../src/services/workspace/reference-cache.utility.js";

const fixture = () => {
  const state = { queries: 0, name: "Foundation", fail: false };
  const db = { async query(sql) {
    state.queries += 1;
    if (state.fail) throw new Error("Database unavailable");
    return { rows: sql.includes("select pt.code")
      ? [{ type: "Residential", name: state.name, disciplines: ["Civil"] }]
      : [{ code: "Civil" }] };
  } };
  return { state, db };
};

test("concurrent reference reads share queries without sharing mutable results", async () => {
  const { state, db } = fixture();
  const cache = createReferenceCache();
  const [a, b] = await Promise.all([cache.get(db), cache.get(db)]);
  assert.equal(state.queries, 2);
  a.backendPhases.Residential[0].name = "Changed by caller";
  assert.equal(b.backendPhases.Residential[0].name, "Foundation");
  assert.equal((await cache.get(db)).backendPhases.Residential[0].name, "Foundation");
  assert.equal(state.queries, 2);
});

test("expired reference data is refreshed, and database errors are retried", async () => {
  const { state, db } = fixture();
  let time = 0;
  const cache = createReferenceCache({ ttlMs: 100, now: () => time });
  await cache.get(db);
  time = 99;
  await cache.get(db);
  assert.equal(state.queries, 2);
  time = 100;
  state.fail = true;
  await assert.rejects(cache.get(db), /Database unavailable/);
  state.fail = false;
  state.name = "Structure";
  assert.equal((await cache.get(db)).backendPhases.Residential[0].name, "Structure");
  assert.equal(state.queries, 5);
});

test("clearing the cache refreshes definitions even when a previous read is still in flight", async () => {
  const { db } = fixture();
  let finish;
  const oldDb = { query: () => new Promise(resolve => { finish = resolve; }) };
  const cache = createReferenceCache();
  const old = cache.get(oldDb);
  cache.clear();
  await cache.get(db);
  finish({ rows: [] });
  // readReferences performs a second query; release that one as well.
  await new Promise(resolve => setImmediate(resolve));
  finish({ rows: [] });
  await old;
  assert.equal((await cache.get(db)).backendPhases.Residential[0].name, "Foundation");
});

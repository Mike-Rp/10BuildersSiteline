import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import app from "../api/index.js";

test("Vercel entry serves nested API routes and parses JSON without the local launcher", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const protectedRoute = await fetch(`${base}/workspace/project-data`);
  assert.equal(protectedRoute.status, 401);
  assert.equal(protectedRoute.headers.get("cache-control"), "private, no-store");
  assert.equal(protectedRoute.headers.get("cdn-cache-control"), "no-store");
  assert.equal(protectedRoute.headers.get("vercel-cdn-cache-control"), "no-store");
  assert.equal(protectedRoute.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.match(protectedRoute.headers.get("content-type"), /application\/json/);
  const malformed = await fetch(`${base}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{invalid",
  });
  assert.equal(malformed.status, 400);
  assert.equal(malformed.headers.get("cache-control"), "private, no-store");
  assert.equal(malformed.headers.get("x-robots-tag"), "noindex, nofollow");
});

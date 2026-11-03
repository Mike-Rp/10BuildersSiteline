import { test } from "node:test";
import assert from "node:assert/strict";
import { SESSION_IDLE_MS, sessionTiming } from "../src/domain/session-inactivity.js";

test("legacy JWTs without a session ID safely fall back to their issued-at time", () => {
  const result = sessionTiming({ iat: 100, exp: 2000 }, undefined, 110_000);
  assert.equal(result.lastActivityAt, 100_000);
  assert.equal(result.expiresAt, 100_000 + SESSION_IDLE_MS);
  assert.equal(result.expired, false);
});

test("a stored activity timestamp is used only when both session IDs match", () => {
  const activity = { sessionId: "session-a", lastActivityAt: "2026-11-03T00:00:00.000Z" };
  const matched = sessionTiming({ jti: "session-a", iat: 1, exp: 2_000_000_000 }, activity, Date.parse("2026-11-03T00:01:00.000Z"));
  assert.equal(matched.lastActivityAt, Date.parse(activity.lastActivityAt));
  const legacy = sessionTiming({ iat: 100, exp: 1000 }, activity, 110_000);
  assert.equal(legacy.lastActivityAt, 100_000);
});

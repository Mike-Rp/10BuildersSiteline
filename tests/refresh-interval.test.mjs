import assert from "node:assert/strict"
import test from "node:test"
import {
  DEFAULT_REFRESH_SECONDS, MAX_REFRESH_SECONDS, MIN_REFRESH_SECONDS, REFRESH_CHOICES,
  applyRefreshSetting, clampRefreshSeconds, isStale, isValidRefreshSeconds, refreshMs, refreshSeconds, startPolling,
} from "../src/refresh-interval.ts"

test("the default is five minutes and unusable values fall back or clamp into 15 to 3600 seconds", () => {
  assert.equal(DEFAULT_REFRESH_SECONDS, 300)
  for (const value of [undefined, null, "", "abc", NaN, Infinity]) assert.equal(clampRefreshSeconds(value), 300, String(value))
  assert.equal(clampRefreshSeconds(1), MIN_REFRESH_SECONDS)
  assert.equal(clampRefreshSeconds(0), MIN_REFRESH_SECONDS)
  assert.equal(clampRefreshSeconds(-30), MIN_REFRESH_SECONDS)
  assert.equal(clampRefreshSeconds(999999), MAX_REFRESH_SECONDS)
  assert.equal(clampRefreshSeconds(90.4), 90)
  assert.equal(clampRefreshSeconds("120"), 120)
  assert.deepEqual([14, 15, 3600, 3601, 15.5, "15", null].map(isValidRefreshSeconds), [false, true, true, false, false, false, false])
  assert.ok(REFRESH_CHOICES.every(choice => isValidRefreshSeconds(choice.seconds)))
  assert.ok(REFRESH_CHOICES.some(choice => choice.seconds === 15) && REFRESH_CHOICES.some(choice => choice.seconds === 300))
})

test("the setting reaches every timer and a removed setting returns to the default", () => {
  applyRefreshSetting({ refreshSeconds: 15 })
  assert.equal(refreshSeconds(), 15); assert.equal(refreshMs(), 15000)
  applyRefreshSetting({})
  assert.equal(refreshSeconds(), 300)
  applyRefreshSetting({ refreshSeconds: 60 }); applyRefreshSetting(undefined)
  assert.equal(refreshSeconds(), 300)
  applyRefreshSetting(null)
  assert.equal(refreshMs(), 300000)
})

test("polling waits the current interval, follows a changed setting, skips hidden pages and stops cleanly", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  applyRefreshSetting({ refreshSeconds: 300 })
  let runs = 0, visible = true
  const flush = async () => { for (let i = 0; i < 4; i++) await Promise.resolve() }
  // The first read loads a shorter interval, as happens when an Administrator switches to 15 seconds.
  const stop = startPolling(() => { runs++; if (runs === 1) applyRefreshSetting({ refreshSeconds: 15 }) }, () => visible)
  t.mock.timers.tick(299_000); await flush()
  assert.equal(runs, 0, "nothing runs before the interval")
  t.mock.timers.tick(1_000); await flush()
  assert.equal(runs, 1)
  t.mock.timers.tick(14_000); await flush()
  assert.equal(runs, 1, "the new interval has not elapsed yet")
  t.mock.timers.tick(1_000); await flush()
  assert.equal(runs, 2, "the next cycle already uses the new, shorter interval")
  const before = runs
  visible = false
  t.mock.timers.tick(15_000); await flush()
  assert.equal(runs, before, "a hidden page is not polled")
  visible = true
  t.mock.timers.tick(15_000); await flush()
  assert.equal(runs, before + 1, "polling resumes when the page is visible again")
  stop()
  t.mock.timers.tick(600_000); await flush()
  assert.equal(runs, before + 1, "stopped polling never runs again")
  applyRefreshSetting({})
})

test("a failing read does not stop later cycles", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  applyRefreshSetting({ refreshSeconds: 15 })
  let runs = 0
  const stop = startPolling(() => { runs++; throw new Error("offline") }, () => true)
  for (let i = 0; i < 3; i++) { t.mock.timers.tick(15_000); await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
  assert.equal(runs, 3)
  stop(); applyRefreshSetting({})
})

test("a tab is stale only after a full interval", () => {
  applyRefreshSetting({ refreshSeconds: 300 })
  const now = 1_000_000
  assert.equal(isStale(now - 299_999, now), false)
  assert.equal(isStale(now - 300_000, now), true)
  applyRefreshSetting({ refreshSeconds: 15 })
  assert.equal(isStale(now - 15_000, now), true)
  assert.equal(isStale(now - 14_000, now), false)
  applyRefreshSetting({})
})

import assert from "node:assert/strict"
import test from "node:test"
import { notificationAction } from "../src/notification-action.ts"
import { mapEvent } from "../src/api/adapter.ts"

const self = "11111111-1111-4111-8111-111111111111"
const other = "22222222-2222-4222-8222-222222222222"
const event = changes => ({ id: "1", title: "Notification", detail: "Full message", date: "2026-10-25T01:00:00Z", type: "notice", read: false, target: "Dashboard", ...changes })

test("notifications link only to currently authorized projects and pages", () => {
  const actor = { id: self, role: "spm" }, projects = [{ id: "project", name: "Assigned site" }]
  assert.deepEqual(notificationAction(event({ projectId: "project" }), actor, projects, [], []), { kind: "project", id: "project", label: "Open project" })
  assert.equal(notificationAction(event({ projectId: "outside", target: "Assignments" }), actor, projects, [], ["Assignments"]), undefined)
  assert.deepEqual(notificationAction(event({ target: "Assignments" }), actor, projects, [], ["Assignments"]), { kind: "page", page: "Assignments", label: "Open Assignments" })
  assert.equal(notificationAction(event({ target: "https://example.test", detail: "Open account " + other }), actor, projects, [], ["Assignments"]), undefined)
  assert.equal(notificationAction(event({}), actor, projects, [], ["Dashboard"]), undefined, "generic stored targets must not just send the user back to the dashboard")
  assert.equal(notificationAction(event({ projectId: "project" }), { id: self, role: "client" }, projects, [], []).label, "Open project history")
})

test("license reminders open the engineer's own profile or an authorized administrator account view", () => {
  const staff = { id: self, role: "spm" }, admin = { id: "admin", role: "admin" }
  assert.deepEqual(notificationAction(event({ title: "License renewal reminder" }), staff, [], [], []), { kind: "profile", label: "View my license" })
  assert.deepEqual(notificationAction(event({ title: "PRC license expiring soon", accountId: self }), staff, [], [], []), { kind: "profile", label: "View my license" })
  assert.equal(notificationAction(event({ accountId: other }), staff, [], [{ id: other }], []), undefined)
  assert.deepEqual(notificationAction(event({ accountId: other }), admin, [], [{ id: other }], []), { kind: "account", id: other, label: "Open account" })
  assert.equal(notificationAction(event({ accountId: other }), admin, [], [], []), undefined)
  assert.deepEqual(notificationAction(event({ title: "Engineer license reminder" }), admin, [], [], ["Team"]), { kind: "page", page: "Team", label: "Open Team accounts" })
})

test("the adapter retains a license subject from the canonical anchor without treating the actor or message text as the subject", () => {
  const base = { id: 1, title: "PRC license expiring soon", occurred_at: "2026-10-25T01:00:00Z", is_read: false }
  assert.equal(mapEvent({ ...base, anchor_reference: `license:${self}:expiring_soon:2026-10-31` }).accountId, self)
  assert.equal(mapEvent({ ...base, anchor_reference: "license:not-a-user:expired", actor_user_id: other, detail: self }).accountId, undefined)
})

test('Admin password-reset notifications open the dedicated dashboard view',()=>{
  assert.deepEqual(notificationAction(event({title:'Password reset requested',accountId:other}),{id:self,role:'admin'},[],[{id:other}],[]),{kind:'page',page:'Dashboard',label:'Review password reset requests'})
})

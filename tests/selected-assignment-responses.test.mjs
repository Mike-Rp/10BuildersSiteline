import assert from "node:assert/strict"
import test from "node:test"
import { sendApiWorkflow } from "../src/api/actions.ts"
import { setApiBase, setToken } from "../src/api/client.ts"

for (const type of ["accept_assignment", "decline_assignment"]) {
  test(`${type} responds only to selected phase responsibilities`, async t => {
    setApiBase("http://assignment-test/api/v1")
    setToken("")
    const requests = []
    t.mock.method(globalThis, "fetch", async (url, options) => {
      requests.push({ path: new URL(url).pathname, body: JSON.parse(options.body) })
      return Response.json({ data: {} })
    })
    const actor = { id: "spm", role: "spm" }
    const project = { id: "project", team: ["Design", "Foundation", "Structure"].map((phase, index) => ({
      phase, accountId: "another-engineer", status: "pending", engineers: [
        { accountId: actor.id, status: "pending", responsibilityId: String(index + 1) },
      ],
    })) }
    await sendApiWorkflow({ projects: [project] }, actor, {
      type, projectId: project.id, phases: ["Design", "Structure"], note: "Schedule conflict",
    })
    assert.deepEqual(requests.map(request => request.path.split("/").at(-1)), ["1", "3"])
    assert.ok(requests.every(request => request.body.action === (type === "accept_assignment" ? "accept" : "decline")))
    assert.ok(requests.every(request => request.body.note === "Schedule conflict"))
    await assert.rejects(sendApiWorkflow({ projects: [project] }, actor, { type, projectId: project.id, phases: [] }), /Select at least one/)
  })
}

test("a failed selection batch reports the responses already saved", async t => {
  setApiBase("http://assignment-test/api/v1")
  setToken("")
  let calls = 0
  t.mock.method(globalThis, "fetch", async () => {
    calls++
    return Response.json(calls === 1 ? { data: {} } : { message: "Assignment changed" }, { status: calls === 1 ? 200 : 409 })
  })
  const project = { id: "project", team: ["Design", "Foundation"].map((phase, i) => ({
    phase, engineers: [{ accountId: "spm", status: "pending", responsibilityId: String(i + 1) }],
  })) }
  await assert.rejects(sendApiWorkflow({ projects: [project] }, { id: "spm" }, {
    type: "accept_assignment", projectId: project.id, phases: ["Design", "Foundation"],
  }), /1 selected phase responses saved.*Assignment changed/)
})

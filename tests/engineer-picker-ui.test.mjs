import assert from "node:assert/strict"
import test from "node:test"
import { emptyState } from "../src/model.ts"

test("engineer picker ranks uncovered qualifications, searches, previews and preserves assignments", async () => {
  const [{ JSDOM }, { createServer }, React] = await Promise.all([
    import("jsdom"),
    import("vite"),
    import("react"),
  ])
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" }),
    w = dom.window,
    previous = new Map()
  for (const [key, value] of Object.entries({
    window: w,
    document: w.document,
    Node: w.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    })
  }
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: "custom",
    logLevel: "silent",
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  const { createRoot } = await import("react-dom/client"),
    root = createRoot(document.getElementById("root"))
  try {
    const { default: Panel } = await server.ssrLoadModule(
      "/src/PhaseEngineerAllocation.tsx",
    )
    const required = [
      "Civil",
      "Structural",
      "Mechanical",
      "Electrical",
      "Plumbing",
      "Acoustic",
    ]
    const state = emptyState()
    const person = (id, name, tags) => ({
      id,
      name,
      role: "spm",
      status: "active",
      scope: tags,
      qualifiedRequirements: tags,
      professionalTypes: ["Civil Engineer"],
      eligibleForNewAssignment: true,
      assignmentCandidateProjectIds: ["project"],
      engineerCommitments: [],
      singleProjectCommitment: true,
    })
    state.accounts = [
      person("a", "Existing engineer", ["Civil", "Structural", "Mechanical"]),
      person("overlap", "Overlap engineer", [
        "Civil",
        "Structural",
        "Mechanical",
      ]),
      person("partial", "Partial engineer", ["Electrical"]),
      person("best", "Best engineer", ["Electrical", "Plumbing", "Acoustic"]),
      {
        ...person("unavailable", "Unavailable engineer", required),
        eligibleForNewAssignment: false,
      },
    ]
    let row = {
        phase: "Design",
        engineers: [
          {
            accountId: "a",
            assignedDisciplines: required.slice(0, 3),
            status: "pending",
          },
        ],
      },
      changes = 0
    const render = () =>
      root.render(
        React.createElement(Panel, {
          state,
          type: "Residential",
          row,
          required,
          projectId: "project",
          team: [row],
          onChange: (next) => {
            row = next
            changes++
            render()
          },
        }),
      )
    const button = (name) =>
      [...document.querySelectorAll("button")].find(
        (b) => (b.getAttribute("aria-label") || b.textContent.trim()) === name,
      )
    const click = async (name) =>
      React.act(() => {
        assert.ok(button(name), name)
        button(name).click()
      })
    const choice = (name) =>
      [...document.querySelectorAll(".engineer-choice")].find((b) =>
        b.textContent.includes(name),
      )
    await React.act(render)
    await click("Add engineer")
    assert.equal(changes, 0, "opening does not alter the team")
    assert.ok(
      document
        .querySelector(".engineer-choice")
        .textContent.includes("Best engineer"),
      "best uncovered match ranks ahead of overlapping qualifications",
    )
    assert.match(choice("Best engineer").textContent, /Site PM.*Civil Engineer/)
    assert.match(
      choice("Best engineer").textContent,
      /Electrical.*Plumbing.*Acoustic/,
    )
    assert.match(choice("Overlap engineer").textContent, /fills 0 gaps/)
    assert.equal(choice("Unavailable engineer"), undefined)
    assert.equal(
      choice("Existing engineer"),
      undefined,
      "already selected engineer is excluded when adding",
    )
    assert.match(
      document.querySelector(".engineer-choice-preview").textContent,
      /6 of 6/,
    )
    const search = document.querySelector('input[type="search"]')
    await React.act(() => {
      Object.getOwnPropertyDescriptor(
        w.HTMLInputElement.prototype,
        "value",
      ).set.call(search, "Acoustic")
      search.dispatchEvent(new w.Event("input", { bubbles: true }))
    })
    assert.equal(
      document.querySelectorAll(".engineer-choice").length,
      1,
      "search includes qualified tags",
    )
    await click("Cancel")
    assert.equal(changes, 0)
    await click("Add engineer")
    await click("Use best match")
    assert.deepEqual(row.engineers[0].assignedDisciplines, required.slice(0, 3))
    assert.equal(row.engineers[1].accountId, "best")
    assert.deepEqual(row.engineers[1].assignedDisciplines, [
      "Electrical",
      "Plumbing",
      "Acoustic",
    ])
    assert.equal(
      button("Add engineer").disabled,
      true,
      "full coverage stops unnecessary additions",
    )
    await click("Change Design engineer 2")
    await React.act(() => choice("Partial engineer").click())
    assert.match(
      document.querySelector(".engineer-choice-preview").textContent,
      /4 of 6/,
    )
    await click("Use selected engineer")
    assert.deepEqual(row.engineers[1].assignedDisciplines, ["Electrical"])
    assert.equal(row.engineers[0].accountId, "a")
    await click("Add engineer")
    assert.match(
      document.querySelector(".engineer-choice-preview").textContent,
      /Plumbing, Acoustic/,
    )
    await click("Use best match")
    assert.equal(row.engineers.length, 3)
    assert.deepEqual(
      row.engineers[2].assignedDisciplines,
      ["Plumbing", "Acoustic"],
      "does not take Electrical from the existing owner",
    )
    await click("Change Design engineer 3")
    assert.equal(
      choice("Partial engineer"),
      undefined,
      "replacement cannot duplicate an existing member",
    )
    await React.act(() => choice("Overlap engineer").click())
    assert.equal(
      button("Use selected engineer").disabled,
      true,
      "zero-gap selection cannot create an empty assignment",
    )
    await click("Cancel")
    // No eligible candidate can fill the missing tags; opening remains non-destructive.
    row = { ...row, engineers: row.engineers.slice(0, 1) }
    state.accounts = state.accounts.filter((a) =>
      ["a", "overlap"].includes(a.id),
    )
    await React.act(render)
    await click("Add engineer")
    assert.match(
      document.querySelector(".engineer-no-match").textContent,
      /No available eligible engineer matches/,
    )
    assert.equal(button("Use best match").disabled, true)
    await click("Cancel")
    assert.equal(row.engineers.length, 1)
    // Respect the existing cap even when coverage is incomplete.
    row = {
      ...row,
      engineers: [
        { accountId: "a", assignedDisciplines: ["Civil"], status: "pending" },
        {
          accountId: "partial",
          assignedDisciplines: ["Electrical"],
          status: "pending",
        },
        {
          accountId: "best",
          assignedDisciplines: ["Plumbing"],
          status: "pending",
        },
      ],
    }
    await React.act(render)
    assert.equal(button("Add engineer").disabled, true)
    assert.match(document.body.textContent, /Three-engineer limit reached/)
  } finally {
    await React.act(() => root.unmount())
    await server.close()
    dom.window.close()
    for (const [key, descriptor] of previous)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
  }
})

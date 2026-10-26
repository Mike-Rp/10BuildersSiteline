import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"

const require = createRequire(import.meta.resolve("vite"))
const postcss = require("postcss")
const foundation = await readFile(
  new URL("../src/construction-daylight.css", import.meta.url),
  "utf8",
)
const base = await readFile(
  new URL("../src/index.css", import.meta.url),
  "utf8",
)
const parsed = postcss.parse(foundation)

test("notification messages scroll within the viewport while the header stays visible", () => {
  const declarations = selector => {
    const out = {}
    parsed.walkRules(selector, rule => rule.walkDecls(decl => { out[decl.prop] = decl.value }))
    return out
  }
  assert.equal(declarations("#root .notification-popover").overflow, "hidden")
  assert.match(declarations("#root .notification-popover")["max-height"], /100dvh/)
  assert.equal(declarations("#root .notification-scroll")["overflow-y"], "auto")
  assert.equal(declarations("#root .notification-scroll")["min-height"], "0")
  assert.equal(declarations("#root .notification-popover > .popover-heading")["flex-shrink"], "0")
})

test("Construction Daylight uses the approved global palette", () => {
  const expected = {
    "--color-canvas": "#f3f5f8",
    "--color-surface": "#ffffff",
    "--color-ink": "#1f2937",
    "--color-muted": "#64748b",
    "--color-primary": "#172b4d",
    "--color-success": "#15803d",
    "--color-warning": "#b45309",
    "--color-danger": "#b42318",
    "--color-line": "#d8e0e8",
  }
  const tokens = {}
  parsed.walkRules(":root", (rule) =>
    rule.walkDecls((decl) => {
      tokens[decl.prop] = decl.value.toLowerCase()
    }),
  )
  for (const [key, value] of Object.entries(expected))
    assert.equal(tokens[key], value)
})

test("shared styles never declare text smaller than 14px", () => {
  for (const css of [base, foundation]) {
    const stylesheet = postcss.parse(css)
    stylesheet.walkDecls("font-size", (decl) => {
      if (/^\d+(?:\.\d+)?px$/.test(decl.value)) {
        assert.ok(
          parseFloat(decl.value) >= 14,
          `${decl.parent.selector}: ${decl.value}`,
        )
      }
    })
  }
  assert.match(base, /family=Inter/)
})

test("the shared visual foundation loads globally and has no decorative gradient styles", async () => {
  const main = await readFile(
    new URL("../src/main.tsx", import.meta.url),
    "utf8",
  )
  assert.match(main, /import ['"]\.\/construction-daylight\.css['"]/)
  assert.doesNotMatch(
    base + foundation,
    /(?:linear|radial|conic)-gradient\s*\(/i,
  )
  assert.match(foundation, /--text-body:\s*16px/)
})

test("mobile controls provide 48px targets and readable 16px inputs", () => {
  const mobile = parsed.nodes.filter(
    (node) =>
      node.type === "atrule" &&
      node.name === "media" &&
      node.params === "(max-width: 760px)",
  )
  let buttons = false
  let inputs = false
  for (const block of mobile)
    block.walkRules((rule) => {
      const declarations = Object.fromEntries(
        rule.nodes
          .filter((node) => node.type === "decl")
          .map((decl) => [decl.prop, decl.value]),
      )
      if (
        rule.selector.includes(".button") &&
        declarations["min-height"] === "48px"
      )
        buttons = true
      if (
        rule.selector.includes("input") &&
        declarations["font-size"] === "16px" &&
        declarations["min-height"] === "48px"
      )
        inputs = true
    })
  assert.equal(buttons, true)
  assert.equal(inputs, true)
})

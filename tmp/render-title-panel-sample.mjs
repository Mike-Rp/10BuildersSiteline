import { readFile, writeFile } from "node:fs/promises"

const source = await readFile("__floating-dashboard-title-preview.html", "utf8")
const style = `<style>
#root .ao-heading { padding: 16px 20px; background: #f5f7fa; border: 0; border-left: 3px solid #c9a564; border-radius: 0; box-shadow: none; gap: 18px; }
#root .ao-title-card { padding: 0; background: transparent; border: 0; border-radius: 0; box-shadow: none; cursor: default; }
#root .ao-title-card h1 { margin: 6px 0 0; }
#root .ao-eyebrow { color: #526b87; }
@media(max-width:760px) { #root .ao-heading { padding: 14px 16px; gap: 16px; } }
</style>`
await writeFile("__dashboard-title-panel-sample.html", source.replace("Floating dashboard title · Implementation preview", "Dashboard title panel · Design sample").replace("</head>",style+"</head>"))

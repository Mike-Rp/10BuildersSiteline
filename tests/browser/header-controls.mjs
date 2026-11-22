// Run after npm run build. Exercises the production CSS in a real touch browser.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { launchChrome } from './chrome.mjs'

const css = fs.readdirSync('dist/assets').filter(file => file.endsWith('.css'))
  .map(file => fs.readFileSync(`dist/assets/${file}`, 'utf8')).join('\n')
const chrome = await launchChrome()
try {
  const page = await chrome.page()
  await page.call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
  let checked = 0
  for (const [width, height] of [[320, 568], [360, 640], [390, 844], [768, 360], [900, 600], [568, 280]]) {
    await page.call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true })
    for (const workspace of ['role-workspace', 'admin-workspace', 'client-portal']) {
      await page.call('Page.setDocumentContent', {
        frameId: (await page.call('Page.getFrameTree')).frameTree.frame.id,
        html: `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style>
          <div id="root"><div class="app-shell ${workspace}"><div class="main-shell">
          <header class="topbar"><div class="breadcrumb"><button class="button icon-button sidebar-toggle">☰</button><strong>Dashboard</strong></div>
          <div class="topbar-actions"><div class="notification-container"><button class="button icon-button" aria-expanded="true"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3Z"/></svg></button>
          <div class="notification-popover"><div class="popover-heading"><h3>Your notifications</h3><button class="button text-button">Mark all read</button></div><div class="notification-scroll">${'<div class="activity-item"><span class="activity-copy">A notification about an assignment awaiting your confirmation</span></div>'.repeat(24)}</div></div>
          </div><button class="topbar-avatar avatar">FC</button></div></header></div></div></div>`
      })
      const result = await page.evaluate(`(() => {
        const panel = document.querySelector('.notification-popover'), rect = panel.getBoundingClientRect();
        const button = document.querySelector('.notification-container > button'), style = getComputedStyle(button);
        const scroll = document.querySelector('.notification-scroll');
        return {left:rect.left, right:rect.right, top:rect.top, bottom:rect.bottom,
          color:style.color, background:style.backgroundColor, stroke:getComputedStyle(button.querySelector('svg')).stroke,
          scrolls:scroll.scrollHeight > scroll.clientHeight, overflow:document.documentElement.scrollWidth > innerWidth};
      })()`)
      const label = `${workspace} ${width}x${height}`
      assert.ok(result.left >= 0 && result.right <= width && result.top >= 0 && result.bottom <= height, `${label}: panel bounds ${JSON.stringify(result)}`)
      assert.equal(result.color, 'rgb(25, 59, 89)', `${label}: readable touch foreground`)
      assert.equal(result.background, 'rgb(220, 234, 246)', `${label}: touch selected background`)
      assert.equal(result.stroke, result.color, `${label}: icon follows foreground`)
      assert.ok(result.scrolls, `${label}: older messages scroll within panel`)
      assert.equal(result.overflow, false, `${label}: no horizontal page overflow`)
      checked++
    }
  }
  console.log(`Passed ${checked} touch viewport/workspace combinations.`)
} finally {
  await chrome.close()
}

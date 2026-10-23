// Captures the Knowledge Answer state (mode "answer") or the same state with the sidebar collapsed (mode "collapsed")
// from the origin/main build on port 4181. Saves only after state checks pass; never overwrites.
// Usage: node kn-main-capture.mjs answer|collapsed
import { chromium } from '/home/user/cortana/node_modules/playwright/index.mjs'
const S = '/tmp/claude-0/-home-user/fc166f53-13cb-5efd-bbbd-0d37fe395dec/scratchpad/b1-v31'
const BUILD = '6fc6d59'
const mode = process.argv[2]
if (!['answer', 'collapsed'].includes(mode)) throw new Error('mode must be answer or collapsed')
const runId = new Date().toISOString().replace(/[:.]/g, '-')
const out = `${S}/real/v2/kn-${mode}-main${BUILD}-${runId}.png`
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true })
const page = await (await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })).newPage()
let status = 0
try {
  await page.goto('http://127.0.0.1:4181/?demo', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[aria-label="System status"]', { state: 'attached', timeout: 60000 })
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'Knowledge', exact: true }).click()
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'Search and reflect' }).click()
  await page.waitForTimeout(800)
  await page.keyboard.press('Enter')
  await page.getByRole('tab', { name: 'Answer' }).waitFor({ state: 'attached', timeout: 20000 })
  await page.waitForTimeout(1500)
  if (mode === 'collapsed') {
    await page.getByRole('button', { name: 'Collapse sidebar' }).click()
    await page.waitForTimeout(900)
  }
  const answerSelected = await page.getByRole('tab', { name: 'Answer' }).first().getAttribute('aria-selected')
  const documentSelected = await page.getByRole('tab', { name: 'Document' }).first().getAttribute('aria-selected').catch(() => null)
  const brief = await page.getByText('Evidence brief', { exact: false }).count()
  const chip = await page.evaluate(() => document.querySelector('button[aria-label^="Switch workspace"]')?.textContent.trim() ?? '')
  const expandVisible = await page.getByRole('button', { name: 'Expand sidebar' }).count()
  const state = { mode, answerSelected, documentSelected, evidenceBrief: brief, workspaceChip: chip, expandSidebarVisible: expandVisible }
  console.log(JSON.stringify(state))
  const ok = answerSelected === 'true' && documentSelected !== 'true' && brief > 0 && /Work$/.test(chip) && (mode === 'answer' ? expandVisible === 0 : expandVisible > 0)
  if (!ok) { console.log('ABORT: state not verified; nothing saved'); status = 2 }
  else {
    await page.mouse.move(1430, 890); await page.waitForTimeout(300)
    await page.screenshot({ path: out })
    console.log('saved', out)
  }
} catch (e) {
  console.log('ERROR', e.message.slice(0, 160)); status = 1
} finally {
  await b.close()
}
process.exitCode = status

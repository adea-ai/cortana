// Renders one part of a board set to PNG, with a readiness check for every board.
//
// Hard failures exit non-zero: a navigation or screenshot error, a page error, or a declared board with no
// report. A board whose required resources fail, or are still pending when the page settles, is INCOMPLETE:
// its PNG is kept as evidence, the reasons are listed under `incomplete` in the part report, and the part
// still exits 0. render_run.py refuses to manifest a run with incomplete boards unless --allow-incomplete.
//
// Required resource types: image, font, stylesheet, script, document, fetch, xhr. A resource fails when it
// returns HTTP 400 or more, or when the request fails outright (missing file, blocked host, reset connection).
// Any required request to http(s) is incomplete as well, even when it succeeds: the run does not pin network
// resources, so the board's pixels depend on what the network returned.
// Images are also checked after settling: an <img> with a src that is not loaded is incomplete.
// Images and fonts inside shadow roots are not inspected directly; their requests are still tracked.
//
// Usage (normally called by render_run.py, not by hand):
//   node render-all.mjs --project <dir> --out <fresh dir> --part <i> --parts <n> --run-id <id>
//     [--chrome <path>] [--playwright <index.mjs>] [--font <woff2>] [--settle-ms 900]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  if (i === -1) return fallback
  const v = process.argv[i + 1]
  if (v === undefined || v.startsWith('--')) throw new Error(`missing value for ${name}`)
  return v
}
function fail(msg) {
  console.error(`render-all: ${msg}`)
  process.exit(1)
}

const project = arg('--project')
const out = arg('--out')
const part = Number(arg('--part', '0'))
const parts = Number(arg('--parts', '1'))
const runId = arg('--run-id')
const chrome = arg('--chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
const playwright = arg('--playwright', '/home/user/cortana/node_modules/playwright/index.mjs')
const fontFile = arg('--font', null)
const settleMs = Number(arg('--settle-ms', '900'))

if (!project || !out || !runId) fail('--project, --out and --run-id are required')
if (!Number.isInteger(part) || !Number.isInteger(parts) || part < 0 || part >= parts) fail('bad --part/--parts')
if (!existsSync(chrome)) fail(`browser not found: ${chrome}`)
if (!existsSync(playwright)) fail(`playwright not found: ${playwright}`)

// The declared board set is canvas.json "order". Every declared board must exist on disk.
const canvas = JSON.parse(readFileSync(join(project, 'canvas.json'), 'utf8'))
// canvas.json lists file names (Main.dc.html); the board name is the file name without .dc.html.
const declared = canvas.order.map((f) => f.replace(/\.dc\.html$/, ''))
if (!Array.isArray(declared) || declared.length === 0) fail('canvas.json has no order')
const missing = declared.filter((n) => !existsSync(join(project, `${n}.dc.html`)))
if (missing.length) fail(`declared boards missing on disk: ${missing.join(', ')}`)

// Each run gets its own output directory, claimed by a _RUN marker holding the run id. A directory is
// accepted only if it is new or its marker names this run; parts of one run share the directory.
const marker = join(out, '_RUN')
if (existsSync(out)) {
  if (!existsSync(marker) || readFileSync(marker, 'utf8').trim() !== runId) {
    fail(`output directory belongs to another run or is not a run directory: ${out}`)
  }
} else {
  mkdirSync(out, { recursive: true })
  writeFileSync(marker, `${runId}\n`)
}

const names = declared.filter((_, i) => i % parts === part)
const css = fontFile
  ? `@font-face{font-family:'Space Grotesk';src:url('${pathToFileURL(fontFile).href}');font-weight:300 700}`
  : ''

const REQUIRED = new Set(['image', 'font', 'stylesheet', 'script', 'document', 'fetch', 'xhr'])
const READY_TIMEOUT_MS = 10000
const NAV_TIMEOUT_MS = 20000
const short = (s) => s.slice(0, 200)

const { chromium } = await import(pathToFileURL(playwright).href)
const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['--allow-file-access-from-files'],
})
const report = {
  runId,
  part,
  parts,
  browserVersion: browser.version(),
  declaredInPart: names,
  rendered: [],
  incomplete: [],
  errors: [],
}
try {
  for (const n of names) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const pageErrors = []
    const pending = new Set()
    const failed = []
    const isRequired = (r) => REQUIRED.has(r.resourceType())
    page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 200)))
    const external = new Set()
    page.on('request', (r) => {
      if (!isRequired(r)) return
      pending.add(r)
      // A network resource is not pinned by the run, so the board cannot be reproduced from the manifest.
      if (/^https?:/.test(r.url())) external.add(`${r.resourceType()} from the network (not reproducible): ${short(r.url())}`)
    })
    page.on('requestfinished', (r) => pending.delete(r))
    page.on('requestfailed', (r) => {
      if (!isRequired(r)) return
      pending.delete(r)
      failed.push(`${r.resourceType()} failed (${r.failure()?.errorText ?? 'unknown'}): ${short(r.url())}`)
    })
    page.on('response', (res) => {
      const r = res.request()
      if (isRequired(r) && res.status() >= 400) {
        failed.push(`${r.resourceType()} HTTP ${res.status()}: ${short(res.url())}`)
      }
    })
    try {
      await page.goto(pathToFileURL(join(project, `${n}.dc.html`)).href, {
        waitUntil: 'domcontentloaded',
        timeout: NAV_TIMEOUT_MS,
      })
      if (css) await page.addStyleTag({ content: css })
      await page.waitForTimeout(settleMs)
      const deadline = Date.now() + READY_TIMEOUT_MS
      while (pending.size && Date.now() < deadline) await page.waitForTimeout(100)
      const unloadedImages = await page.evaluate(async () => {
        await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 5000))])
        return [...document.images]
          .filter((i) => i.getAttribute('src') && !(i.complete && i.naturalWidth > 0))
          .map((i) => i.getAttribute('src').slice(0, 200))
      })
      const reasons = [
        ...external,
        ...failed,
        ...[...pending].map((r) => `${r.resourceType()} still pending after ${READY_TIMEOUT_MS} ms: ${short(r.url())}`),
        ...unloadedImages.map((src) => `image not loaded: ${src}`),
      ]
      await page.screenshot({ path: join(out, `${n}.png`), clip: { x: 0, y: 0, width: 1440, height: 900 } })
      const unique = [...new Set(reasons)]
      if (unique.length) report.incomplete.push({ board: n, reasons: unique })
      else report.rendered.push(n)
    } catch (e) {
      report.errors.push({ board: n, error: `navigation, readiness or screenshot: ${e.message.slice(0, 200)}` })
    }
    if (pageErrors.length) report.errors.push({ board: n, pageErrors })
    await page.close()
  }
} finally {
  await browser.close()
  writeFileSync(join(out, `_part-${part}.json`), JSON.stringify(report, null, 1))
}
if (report.errors.length) {
  console.error(`render-all: part ${part} had ${report.errors.length} error(s)`)
  process.exit(1)
}
console.log(`render-all: part ${part} rendered ${report.rendered.length} board(s), ${report.incomplete.length} incomplete`)

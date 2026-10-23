// Renders one part of a board set to PNG, with a readiness check for every board.
//
// The boards are served from the project directory by a local HTTP server (so the absolute /_blob/ paths
// resolve), and every network request is answered from the committed asset map in assets/manifest.json:
//   - a /_blob/<id> path is served from the map;
//   - an http(s) URL in the map is fulfilled from its committed file;
//   - any other http(s) request is aborted and makes its board incomplete.
// Each mapped file is checked against its sha256 before the run starts. render_run.py records the asset map
// as a run input and refuses the run if the map changes during the render.
//
// Hard failures exit non-zero: a missing declared board, a bad asset, a navigation or screenshot error, a page
// error, or a declared board with no report. A board whose required resources fail, or are still pending when
// the page settles, or that makes a request outside the asset map, is INCOMPLETE. Its PNG is kept as evidence,
// the reasons are listed under `incomplete` in the part report, and the part still exits 0. render_run.py refuses
// to manifest a run with incomplete boards unless --allow-incomplete is given.
//
// Required resource types: image, font, stylesheet, script, document, fetch, xhr. A resource fails when it
// returns HTTP 400 or more, or when the request fails outright. Images are also checked after settling: an <img>
// with a src that is not loaded is incomplete. Images and fonts inside shadow roots are not inspected directly;
// their requests are still tracked.
//
// Usage (normally called by render_run.py, not by hand):
//   node render-all.mjs --project <dir> --out <fresh dir> --part <i> --parts <n> --run-id <id>
//     [--chrome <path>] [--playwright <index.mjs>] [--font <woff2>] [--settle-ms 900] [--assets <dir>]
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))

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
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

const project = resolve(arg('--project', ''))
const out = arg('--out')
const part = Number(arg('--part', '0'))
const parts = Number(arg('--parts', '1'))
const runId = arg('--run-id')
const chrome = arg('--chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
const playwright = arg('--playwright', '/home/user/cortana/node_modules/playwright/index.mjs')
const fontFile = arg('--font', null)
const settleMs = Number(arg('--settle-ms', '900'))
const assetsDir = resolve(arg('--assets', join(HERE, 'assets')))

if (!arg('--project', '') || !out || !runId) fail('--project, --out and --run-id are required')
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

// The asset map. Every file is checked against its committed sha256 before anything is claimed or launched.
const assetManifestPath = join(assetsDir, 'manifest.json')
if (!existsSync(assetManifestPath)) fail(`asset manifest not found: ${assetManifestPath}`)
const assetManifestBytes = readFileSync(assetManifestPath)
const assetManifest = JSON.parse(assetManifestBytes.toString('utf8'))
if (assetManifest.schema !== 'b1-harness-assets/1' || !Array.isArray(assetManifest.entries)) {
  fail('asset manifest has an unknown schema')
}
const blobs = new Map() // "/_blob/<id>" -> {path, contentType}
const routes = new Map() // absolute http(s) URL -> {path, contentType}
for (const e of assetManifest.entries) {
  const path = resolve(assetsDir, e.file)
  if (!path.startsWith(assetsDir + sep)) fail(`asset path escapes the assets directory: ${e.file}`)
  if (!existsSync(path)) fail(`asset missing: ${e.file}`)
  const digest = sha256(readFileSync(path))
  if (digest !== e.sha256) fail(`asset sha256 mismatch: ${e.file} (manifest ${e.sha256}, file ${digest})`)
  const hit = { path, contentType: e.contentType }
  if (e.url.startsWith('/_blob/')) blobs.set(e.url, hit)
  else if (/^https?:\/\//.test(e.url)) routes.set(e.url, hit)
  else fail(`asset url is neither a /_blob path nor http(s): ${e.url}`)
}
const assetsSha256 = sha256(assetManifestBytes)

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
const REQUIRED = new Set(['image', 'font', 'stylesheet', 'script', 'document', 'fetch', 'xhr'])
const READY_TIMEOUT_MS = 10000
const NAV_TIMEOUT_MS = 20000
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}
const FONT_PATH = '/__harness__/font'

// The board server. Boards load from the project directory; /_blob/ comes from the asset map.
const server = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname)
  const cors = { 'access-control-allow-origin': '*' }
  if (pathname.startsWith('/_blob/')) {
    const hit = blobs.get(pathname)
    if (!hit) {
      res.writeHead(404, cors)
      return res.end()
    }
    res.writeHead(200, { ...cors, 'content-type': hit.contentType })
    return res.end(readFileSync(hit.path))
  }
  if (pathname === FONT_PATH && fontFile) {
    res.writeHead(200, { ...cors, 'content-type': 'font/woff2' })
    return res.end(readFileSync(fontFile))
  }
  const file = resolve(project, '.' + pathname)
  if (!file.startsWith(project + sep) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, cors)
    return res.end()
  }
  res.writeHead(200, { ...cors, 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`
const short = (s) => s.split(origin).join('<board-origin>').slice(0, 200)
const css = fontFile
  ? `@font-face{font-family:'Space Grotesk';src:url('${origin}${FONT_PATH}');font-weight:300 700}`
  : ''

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
  serving: 'http-local',
  assetsSha256,
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
    const external = new Set()
    const isRequired = (r) => REQUIRED.has(r.resourceType())
    // Only the board server and the asset map may answer. Everything else is aborted.
    await page.route('**/*', (route) => {
      const url = route.request().url()
      if (url.startsWith(origin + '/')) return route.continue()
      const hit = routes.get(url)
      if (hit) {
        return route.fulfill({
          status: 200,
          contentType: hit.contentType,
          headers: { 'access-control-allow-origin': '*' },
          body: readFileSync(hit.path),
        })
      }
      return route.abort('blockedbyclient')
    })
    page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 200)))
    page.on('request', (r) => {
      if (!isRequired(r)) return
      pending.add(r)
      const u = r.url()
      if (/^https?:/.test(u) && !u.startsWith(origin + '/') && !routes.has(u)) {
        external.add(`${r.resourceType()} not in the asset map (not reproducible): ${short(u)}`)
      }
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
      await page.goto(`${origin}/${n}.dc.html`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS })
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
  await new Promise((r) => server.close(r))
  writeFileSync(join(out, `_part-${part}.json`), JSON.stringify(report, null, 1))
}
if (report.errors.length) {
  console.error(`render-all: part ${part} had ${report.errors.length} error(s)`)
  process.exit(1)
}
console.log(`render-all: part ${part} rendered ${report.rendered.length} board(s), ${report.incomplete.length} incomplete`)

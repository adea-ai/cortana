// Browser E2E journeys for the deterministic demo renderer (issue: E2E gap
// audit 2026-09-21). These complement the accessibility gates: they assert
// *behavioral* user journeys — search → answer → citation, memory review
// approval, and workspace persistence across a reload — that unit tests with
// a mocked api bridge cannot see.
//
// Deterministic by construction: everything runs against `?demo=1`, whose
// data lives in apps/web/src/demo.ts. Run via the knowledge-accessibility
// workflow (Chromium is installed there) or manually:
//   bun run --cwd apps/web build
//   node scripts/e2e-journeys.mjs

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const PORT = process.env.E2E_JOURNEYS_PORT ? Number(process.env.E2E_JOURNEYS_PORT) : 4184
const BASE_URL = process.env.E2E_JOURNEYS_BASE_URL ?? `http://127.0.0.1:${PORT}/?demo=1`
const EVIDENCE_DIRECTORY = resolve(ROOT, 'artifacts/e2e-journeys')
const SERVER_TIMEOUT_MS = 60_000
const JOURNEY_TIMEOUT_MS = 20_000

function ensure(condition, message) {
  if (!condition) throw new Error(message)
}

async function waitForServer(timeoutMs = SERVER_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE_URL)
      if (response.ok) return
    } catch {
      // The bounded poll continues until Vite is accepting connections.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  throw new Error('e2e journeys server did not become ready')
}

async function waitForPaint(page) {
  await page.evaluate(
    () =>
      new Promise((resolvePaint) => {
        requestAnimationFrame(() => resolvePaint())
      })
  )
}

async function openDemoApp(context) {
  const page = await context.newPage()
  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 45_000 })
  await page.locator('[data-m7-production-shell-ready]').waitFor({ state: 'attached' })
  await waitForPaint(page)
  return page
}

async function searchProducesAnswerWithEvidence(context) {
  const page = await openDemoApp(context)
  const query = 'How do releases work?'
  const searchBox = page.getByRole('textbox', { name: 'Search your knowledge' })
  await searchBox.click()
  await searchBox.fill(query)
  await searchBox.press('Enter')

  const answer = page.locator('article.answer-view')
  await answer.waitFor({ state: 'visible', timeout: JOURNEY_TIMEOUT_MS })
  // The evidence cards repeat the query as their own heading, so allow
  // multiple matches and scope to the first.
  await answer
    .getByRole('heading', { name: query })
    .first()
    .waitFor({ state: 'visible', timeout: JOURNEY_TIMEOUT_MS })
  const evidenceCount = await answer.locator('.answer-source').count()
  ensure(evidenceCount > 0, 'the answer view rendered without any evidence items')
  ensure(
    (await answer.textContent())?.includes('cited passages'),
    'the answer view did not state its citation count'
  )

  await page.screenshot({ path: resolve(EVIDENCE_DIRECTORY, 'journey-answer.png') })
  return { journey: 'search-answer-evidence', evidenceCount }
}

async function openDocumentAndCopyCitation(context) {
  const page = await openDemoApp(context)
  await page.locator('button.document-node').first().click()
  const documentView = page.locator('article.canonical-document')
  await documentView.waitFor({ state: 'visible', timeout: JOURNEY_TIMEOUT_MS })
  const title = ((await documentView.getByRole('heading').first().textContent()) ?? '').trim()
  ensure(title.length > 0, 'the canonical document rendered without a title')

  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: 'Copy citation' }).click()
  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  ensure(clipboard.length > 0, 'copy citation produced an empty clipboard payload')
  ensure(
    clipboard.includes(title),
    `citation payload lost the document title: ${clipboard.slice(0, 120)}`
  )

  await page.screenshot({ path: resolve(EVIDENCE_DIRECTORY, 'journey-citation.png') })
  return { journey: 'open-document-copy-citation', title, clipboardCharacters: clipboard.length }
}

async function approveMemoryCandidate(context) {
  const page = await openDemoApp(context)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.locator('.settings-view').waitFor()
  await page.getByRole('button', { name: 'Memory', exact: true }).click()

  const queue = page.getByRole('list', { name: 'Memory candidate queue' })
  await queue.waitFor({ state: 'visible', timeout: JOURNEY_TIMEOUT_MS })

  // Candidates load asynchronously; poll until the queue has entries.
  let before = 0
  const loadDeadline = Date.now() + JOURNEY_TIMEOUT_MS
  while (Date.now() < loadDeadline) {
    before = await queue.getByRole('listitem').count()
    if (before > 0) break
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  ensure(before > 0, 'the demo memory review queue rendered empty')

  // Select the candidate row (its accessible name is the candidate title),
  // which opens the detail pane holding the approval controls.
  await queue
    .getByRole('button', { name: /Release validation preference/ })
    .first()
    .click()
  const approve = page.getByRole('button', { name: /Approve canonical memory/ }).first()
  await approve.waitFor({ state: 'visible', timeout: JOURNEY_TIMEOUT_MS })
  await approve.click()
  // Approval routes through the settings confirm dialog ("Continue").
  await page
    .getByRole('button', { name: 'Continue' })
    .waitFor({ state: 'visible', timeout: JOURNEY_TIMEOUT_MS })
  await page.getByRole('button', { name: 'Continue' }).click()

  // Demo approval resolves as "review": the candidate stays queued and the
  // review surface must say no canonical memory changed.
  const notice = page.locator('.memory-review-message')
  await notice.waitFor({ state: 'visible', timeout: JOURNEY_TIMEOUT_MS })
  ensure(
    (await notice.textContent())?.includes('remain in review'),
    'approval did not surface the review-status outcome'
  )

  await page.screenshot({ path: resolve(EVIDENCE_DIRECTORY, 'journey-memory-review.png') })
  return { journey: 'memory-review-approve', queueBefore: before }
}

async function workspaceSelectionSurvivesReload(context) {
  const page = await openDemoApp(context)
  await page.getByRole('button', { name: 'Switch workspace' }).click()
  await page.getByRole('menuitemradio', { name: 'Work', exact: true }).click()
  await waitForPaint(page)
  const beforeReload = await page.getByRole('button', { name: 'Switch workspace' }).textContent()

  await page.reload({ waitUntil: 'load' })
  await page.locator('[data-m7-production-shell-ready]').waitFor({ state: 'attached' })
  await waitForPaint(page)
  const afterReload = await page.getByRole('button', { name: 'Switch workspace' }).textContent()
  ensure(
    beforeReload?.trim() === afterReload?.trim(),
    `workspace selection did not survive reload: "${beforeReload}" -> "${afterReload}"`
  )

  await page.screenshot({ path: resolve(EVIDENCE_DIRECTORY, 'journey-persistence.png') })
  return { journey: 'workspace-persistence-reload', workspace: afterReload?.trim() ?? '' }
}

const server = process.env.E2E_JOURNEYS_BASE_URL
  ? null
  : spawn(
      'bun',
      [
        'run',
        '--cwd',
        'apps/web',
        'preview',
        '--',
        '--host',
        '127.0.0.1',
        '--port',
        String(PORT),
        '--strictPort',
      ],
      {
        cwd: ROOT,
        detached: true,
        stdio: 'ignore',
      }
    )

mkdirSync(dirname(EVIDENCE_DIRECTORY), { recursive: true })
mkdirSync(EVIDENCE_DIRECTORY, { recursive: true })

let browser
const journeys = []
try {
  await waitForServer()
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  })

  // Isolated contexts keep localStorage/clipboard state from leaking between
  // journeys; persistence intentionally reloads inside its own journey.
  journeys.push(await searchProducesAnswerWithEvidence(context))
  journeys.push(await openDocumentAndCopyCitation(context))
  journeys.push(
    await approveMemoryCandidate(
      await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
    )
  )
  journeys.push(
    await workspaceSelectionSurvivesReload(
      await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
    )
  )

  const evidence = {
    generated_at: new Date().toISOString(),
    base_url: BASE_URL,
    journeys,
    passed: journeys.length === 4,
  }
  writeFileSync(
    resolve(EVIDENCE_DIRECTORY, 'e2e-journeys.json'),
    `${JSON.stringify(evidence, null, 2)}\n`
  )
  console.log(`e2e journeys passed: ${journeys.map((entry) => entry.journey).join(', ')}`)
} catch (error) {
  writeFileSync(
    resolve(EVIDENCE_DIRECTORY, 'e2e-journeys.json'),
    `${JSON.stringify({ error: String(error), journeys }, null, 2)}\n`
  )
  throw error
} finally {
  await browser?.close()
  if (server) {
    try {
      process.kill(-server.pid)
    } catch {
      // The server may have already exited; cleanup is best-effort.
    }
  }
}

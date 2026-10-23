#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { AxeBuilder } from '@axe-core/playwright'
import { chromium, webkit } from 'playwright'
import { themesForAppearance } from '@adea-ai/ui/lib/themes'
import {
  setViewportAndWaitForLayout,
  waitForTransitionStylesToSettle,
} from './knowledge-accessibility-browser.mjs'

const args = new Map()
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1])
}

const baseUrl = args.get('--base-url') ?? 'http://127.0.0.1:4173'
const output = resolve(args.get('--output') ?? 'artifacts/m7-shadcn/final')
// Destinations that live behind the rail's single utilities trigger rather
// than on a row of their own.
const MENU_DESTINATIONS = new Set(['Settings', 'Updates', 'Index', 'Help Center'])
const widths = args.has('--widths')
  ? args.get('--widths').split(',').map(Number)
  : [320, 768, 1024, 1440, 1920]
const requestedThemes = args.has('--themes')
  ? args.get('--themes').split(',')
  : [
      'blue',
      ...themesForAppearance('dark')
        .map((theme) => theme.id)
        .filter((id) => id !== 'nord'),
    ]
const darkThemeIds = new Set(themesForAppearance('dark').map((theme) => theme.id))
const legacyThemeIds = { blue: 'nord' }
const themes = requestedThemes.map((requestedTheme) => {
  const resolvedTheme = legacyThemeIds[requestedTheme] ?? requestedTheme
  if (!darkThemeIds.has(resolvedTheme)) {
    throw new Error(
      `Unsupported audit theme "${requestedTheme}": Cortana's visual audit accepts dark themes only.`
    )
  }
  return resolvedTheme
})
const primaryTheme = themes[0]
const consoleErrors = []
let screenshotCount = 0

await mkdir(output, { recursive: true })
const engine = args.get('--browser') ?? 'chromium'
if (!['chromium', 'webkit'].includes(engine)) throw new Error(`Unsupported browser: ${engine}`)
const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true })

// The search box lives in the top bar's search menu; open it and return the input.
async function openSearchMenu(page) {
  const search = page.getByRole('textbox', { name: 'Search your knowledge' })
  if (!(await search.isVisible())) {
    await page.getByRole('button', { name: 'Search and reflect' }).click()
  }
  await search.waitFor()
  return search
}

async function openPage(theme, width, state = 'configured') {
  // Reduced motion makes enter/exit animations complete instantly so audits
  // never sample a surface mid-fade and screenshots stay deterministic.
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    reducedMotion: 'reduce',
  })
  await context.addInitScript(
    (value) =>
      localStorage.setItem(
        'cortana.workspace-themes.v1',
        JSON.stringify({ work: value, personal: value })
      ),
    theme
  )
  const page = await context.newPage()
  page.setDefaultTimeout(60_000)
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(`${theme}/${width}: ${message.text()}`)
    }
  })
  await page.goto(`${baseUrl}/?demo=1&demo-state=${state}`, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-m7-production-shell-ready]').waitFor({ state: 'attached' })
  await page.getByRole('button', { name: 'Search and reflect' }).waitFor()
  await page.waitForFunction(
    ({ expectedTheme }) =>
      document.documentElement.dataset.theme === expectedTheme &&
      document.documentElement.dataset.appearance === 'dark',
    { expectedTheme: theme }
  )
  const appliedTheme = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    appearance: document.documentElement.dataset.appearance,
  }))
  if (appliedTheme.theme !== theme || appliedTheme.appearance !== 'dark') {
    throw new Error(
      `Requested ${theme}, but the page applied ${appliedTheme.theme}/${appliedTheme.appearance}`
    )
  }
  return { context, page }
}

// The rail footer keeps one utilities trigger: Index, Help Center, Updates,
// and Settings are reached by opening its menu and choosing the destination.
async function openRailDestination(page, destination) {
  // The compact rail folds these destinations into one trigger; the mobile
  // sheet keeps them as rows, so a missing trigger means a direct row click.
  const trigger = page.getByRole('button', { name: 'User settings' })
  if ((await trigger.count()) === 0) {
    await page.getByRole('button', { name: destination, exact: true }).click()
    return
  }
  await trigger.click()
  await page
    .getByRole('menuitem', {
      name: destination === 'Settings' ? /^Settings\b/ : destination,
    })
    .click()
}

async function openSettings(page, width) {
  if (width <= 768) {
    await page.getByRole('button', { name: 'Toggle navigation' }).click()
    await page.locator('[data-mobile="true"]').waitFor()
  }
  await openRailDestination(page, 'Settings')
  if (width <= 768) await page.locator('[data-mobile="true"]').waitFor({ state: 'detached' })
  await page.locator('.settings-view').waitFor()
  await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor()
}

async function auditUpdatesSettingsRemoved(page) {
  const settingsView = page.locator('.settings-view')
  await settingsView.waitFor()
  if (await settingsView.getByRole('button', { name: 'Updates', exact: true }).count()) {
    throw new Error('Updates must open from the version dialog, not Settings navigation')
  }
  if (await settingsView.getByRole('heading', { name: 'Updates', exact: true }).count()) {
    throw new Error('The separate Updates settings page must not be rendered')
  }
}

async function openDestination(page, width, destination) {
  if (width <= 768) {
    await page.getByRole('button', { name: 'Toggle navigation' }).click()
    await page.locator('[data-mobile="true"]').waitFor()
  }
  if (MENU_DESTINATIONS.has(destination)) await openRailDestination(page, destination)
  else await page.getByRole('button', { name: destination, exact: true }).click()
  if (width <= 768) await page.locator('[data-mobile="true"]').waitFor({ state: 'detached' })
  if (destination === 'Knowledge') await page.locator('.workspace').waitFor()
  else if (destination === 'Help Center')
    await page.getByRole('dialog', { name: 'Help Center' }).waitFor()
  else {
    try {
      await page.getByRole('heading', { name: destination, level: 1 }).waitFor()
    } catch (error) {
      const name = `navigation-failure-${destination.toLowerCase().replaceAll(' ', '-')}`
      const state = await page.evaluate(() => ({
        rootHidden: document.getElementById('root')?.getAttribute('aria-hidden'),
        rootInert: document.getElementById('root')?.hasAttribute('inert'),
        headings: [...document.querySelectorAll('h1')].map((heading) => ({
          text: heading.textContent,
          hidden: heading.closest('[aria-hidden="true"],[inert]') !== null,
          bounds: heading.getBoundingClientRect().toJSON(),
        })),
        dialogs: [...document.querySelectorAll('[role="dialog"]')].map((dialog) => ({
          name: dialog.getAttribute('aria-label'),
          closed: dialog.hasAttribute('data-closed'),
        })),
      }))
      await writeFile(resolve(output, `${name}.json`), `${JSON.stringify(state, null, 2)}\n`)
      await screenshot(page, name)
      throw error
    }
  }
}

async function screenshot(page, name) {
  await page.screenshot({
    path: resolve(output, `${name}.png`),
    animations: 'disabled',
  })
  screenshotCount += 1
}

/**
 * Wait for running CSS transitions to finish before Axe reads computed styles.
 * WebKit can otherwise sample a hovered control with its new fill and its old
 * foreground, which reports contrast that never reaches the screen.
 */
async function waitForTransitionsToSettle(page, timeoutMs = 3_000) {
  await page.evaluate(async (timeout) => {
    const deadline = performance.now() + timeout
    let settledFrames = 0
    while (performance.now() < deadline) {
      await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame))
      const running = document
        .getAnimations()
        .filter(
          (animation) =>
            animation instanceof CSSTransition &&
            animation.playState !== 'idle' &&
            animation.playState !== 'finished'
        )
      if (running.length) settledFrames = 0
      else if (++settledFrames >= 2) return
    }
    throw new Error(`CSS transitions did not settle within ${timeout}ms`)
  }, timeoutMs)
}

async function auditAccessibility(page, label) {
  await page.evaluate(() => document.fonts.ready)
  await waitForTransitionsToSettle(page)
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  if (accessibility.violations.length > 0) {
    const summary = accessibility.violations
      .map(
        (violation) =>
          `${violation.id}: ${violation.help}\n${violation.nodes
            .map((node) => `  ${node.target.join(' ')}: ${node.failureSummary}`)
            .join('\n')}`
      )
      .join('\n')
    throw new Error(`Accessibility violations in ${label}:\n${summary}`)
  }
  const layoutFailures = await page.evaluate(() => {
    const failures = []
    const checkContained = (outer, inner, message) => {
      if (
        inner.left < outer.left - 1 ||
        inner.right > outer.right + 1 ||
        inner.top < outer.top - 1 ||
        inner.bottom > outer.bottom + 1
      )
        failures.push(message)
    }
    for (const description of document.querySelectorAll('[data-slot="list-row-description"]')) {
      const row = description.parentElement?.parentElement
      if (!row || !row.getBoundingClientRect().height) continue
      const title = description.previousElementSibling
      for (const text of [description, title].filter(Boolean))
        checkContained(
          row.getBoundingClientRect(),
          text.getBoundingClientRect(),
          `List row clips its text: ${row.textContent?.trim()}`
        )
    }
    for (const copy of document.querySelectorAll('[data-readiness-copy]')) {
      const title = copy.querySelector('strong')
      const detail = title?.nextElementSibling
      if (
        title &&
        detail &&
        title.getBoundingClientRect().height &&
        detail.getBoundingClientRect().top < title.getBoundingClientRect().bottom - 1
      )
        failures.push(`Readiness description overlaps its label: ${title.textContent}`)
    }
    for (const copy of document.querySelectorAll('[data-activity-card-copy]')) {
      const card = copy.closest('[data-slot="card"]')
      if (!card || !card.getBoundingClientRect().height) continue
      for (const text of copy.querySelectorAll(
        '[data-slot="card-title"], [data-slot="card-description"]'
      ))
        checkContained(
          card.getBoundingClientRect(),
          text.getBoundingClientRect(),
          `Activity card clips its text: ${text.textContent?.trim()}`
        )
    }
    return failures
  })
  if (layoutFailures.length)
    throw new Error(`Layout violations in ${label}:\n${layoutFailures.join('\n')}`)
}

/**
 * Wait until the header's layout stops moving.
 *
 * A root text-size change reflows the bar, and the shell re-reads its own
 * measurements after it, so two frames are not enough to read a settled bar:
 * the controls move again and the bar grows a second row a moment later.
 */
async function waitForHeaderLayoutToSettle(page, timeoutMs = 3_000) {
  await page.evaluate(async (timeout) => {
    const deadline = performance.now() + timeout
    let previous = ''
    let settledFrames = 0
    while (performance.now() < deadline) {
      await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame))
      const bar = document.querySelector('[data-slot="shell-top-bar"]')
      if (!bar) continue
      const signature = [
        Math.round(bar.getBoundingClientRect().height),
        ...[...bar.querySelectorAll('button')].map((node) => {
          const rect = node.getBoundingClientRect()
          return `${Math.round(rect.x)},${Math.round(rect.y)}`
        }),
      ].join('|')
      if (signature === previous) {
        if (++settledFrames >= 3) return
      } else {
        settledFrames = 0
        previous = signature
      }
    }
    throw new Error(`The header layout did not settle within ${timeout}ms`)
  }, timeoutMs)
}

/**
 * The header's controls in the order the eye reads them, and in the order the
 * keyboard reaches them.
 *
 * The bar's DOM order is the leading group and then the trailing group, and
 * wrapping the bar does not change it. A control placed in the shared centre
 * slot would be drawn on the second row and still be tabbed before the
 * trailing group, so the two orders would disagree and the focus would drop to
 * the second row and return to the first. That is the finding #2599 recorded
 * for the top bar's two-row layout.
 */
async function headerControlOrders(page) {
  const controls = await page.evaluate(() => {
    const bar = document.querySelector('[data-slot="shell-top-bar"]')
    if (!bar) return []
    return [...bar.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')]
      .filter((node) => {
        if (node.getAttribute('tabindex') === '-1') return false
        if (node.hasAttribute('disabled')) return false
        const style = getComputedStyle(node)
        if (style.display === 'none' || style.visibility === 'hidden') return false
        const rect = node.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      })
      .map((node) => {
        const rect = node.getBoundingClientRect()
        return {
          name: node.getAttribute('aria-label') ?? node.textContent?.trim() ?? node.tagName,
          // The bar is the offset parent, so a control's offsetTop is its row
          // within the bar.
          row: node.offsetTop,
          x: rect.x,
        }
      })
  })
  // The order the eye reads them: row by row, then left to right.
  const visual = controls.toSorted((a, b) => a.row - b.row || a.x - b.x)

  // The order the keyboard walks the same controls in, starting at the bar's
  // first focusable control and stopping when the focus leaves the bar.
  await page.evaluate(() => {
    const bar = document.querySelector('[data-slot="shell-top-bar"]')
    const first = bar?.querySelector(
      'button:not([disabled]), a[href], input:not([disabled]), select, textarea'
    )
    if (first instanceof HTMLElement) first.focus()
  })
  const keyboard = []
  for (let index = 0; index < 20; index += 1) {
    const stop = await page.evaluate(() => {
      const active = document.activeElement
      const bar = document.querySelector('[data-slot="shell-top-bar"]')
      if (!active || !bar || !bar.contains(active)) return null
      const rect = active.getBoundingClientRect()
      return {
        name: active.getAttribute('aria-label') ?? active.textContent?.trim() ?? active.tagName,
        insideViewport: rect.top >= 0 && rect.left >= 0 && rect.right <= window.innerWidth,
      }
    })
    if (!stop) break
    keyboard.push(stop)
    await page.keyboard.press('Tab')
  }
  return { visual, keyboard }
}

{
  for (const theme of themes) {
    for (const width of widths) {
      const { context, page } = await openPage(theme, width)
      if (theme === primaryTheme && width === 320) {
        await page.keyboard.press('Tab')
        const skipLink = page.getByRole('link', { name: 'Skip to main content', exact: true })
        if (!(await skipLink.evaluate((element) => element === document.activeElement))) {
          throw new Error('The shared skip link is not the first keyboard stop')
        }
        const bounds = await skipLink.boundingBox()
        if (!bounds || bounds.y < 0) throw new Error('The focused shared skip link remains hidden')
        await skipLink.press('Enter')
        if (
          !(await page
            .locator('#main-content')
            .evaluate((element) => element === document.activeElement))
        ) {
          throw new Error('The shared skip link did not focus main content')
        }
      }
      await screenshot(page, `shell-${theme}-${width}`)
      await auditAccessibility(page, `${theme}/${width} production shell`)

      await page.getByRole('button', { name: 'System status', exact: true }).click()
      await page.locator('[aria-label="System status details"]').waitFor()
      await auditAccessibility(page, `${theme}/${width} system status`)
      await screenshot(page, `system-status-${theme}-${width}`)
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'System status', exact: true }).waitFor()

      if (theme === primaryTheme && width === 320) {
        const mobileSearch = await openSearchMenu(page)
        await mobileSearch.fill('How do releases work?')
        await mobileSearch.press('Enter')
        await page.getByRole('heading', { name: 'How do releases work?', level: 1 }).waitFor()
        await auditAccessibility(page, 'mobile populated knowledge answer')
        await screenshot(page, `knowledge-answer-${theme}-320`)

        const navigationTrigger = page.getByRole('button', { name: 'Toggle navigation' })
        await navigationTrigger.click()
        await page.locator('[data-mobile="true"]').waitFor()
        await page.getByRole('button', { name: 'Conversations', exact: true }).click()
        await page.locator('[data-mobile="true"]').waitFor({ state: 'detached' })
        await page.getByRole('heading', { name: 'Conversations', level: 1 }).waitFor()
        await navigationTrigger.click()
        await page.locator('[data-mobile="true"]').waitFor()
        await page.getByRole('button', { name: 'Knowledge', exact: true }).click()
        await page.getByRole('heading', { name: 'How do releases work?', level: 1 }).waitFor()

        await page.evaluate(() => {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        })
        for (let index = 0; index < 80; index += 1) {
          await page.keyboard.press('Tab')
          if (await navigationTrigger.evaluate((element) => element === document.activeElement)) {
            break
          }
        }
        if (!(await navigationTrigger.evaluate((element) => element === document.activeElement))) {
          throw new Error('Mobile navigation trigger was not reachable by keyboard')
        }
        const focusStyle = await navigationTrigger.evaluate((element) => {
          const style = getComputedStyle(element)
          return { boxShadow: style.boxShadow, outlineStyle: style.outlineStyle }
        })
        if (focusStyle.boxShadow === 'none' && focusStyle.outlineStyle === 'none') {
          throw new Error('Mobile navigation trigger has no visible focus indicator')
        }
        await navigationTrigger.press('Enter')
        await page.locator('[data-mobile="true"]').waitFor()
        // The sheet lists every footer row, including the ones the compact
        // rail folds into its utilities trigger.
        await page.getByRole('button', { name: 'Inbox', exact: true }).waitFor()
        await page.waitForTimeout(300)
        await auditAccessibility(page, 'mobile production navigation')
        await screenshot(page, `mobile-navigation-${theme}-320`)
        await openRailDestination(page, 'About')
        const aboutDialog = page.getByRole('dialog', { name: 'About Cortana' })
        await aboutDialog.waitFor()
        await auditAccessibility(page, 'mobile About dialog')
        await screenshot(page, `about-dialog-${theme}-320`)
        await aboutDialog.getByRole('button', { name: 'Close' }).click()
        await aboutDialog.waitFor({ state: 'detached' })
        await page.waitForFunction(
          () => document.activeElement?.getAttribute('aria-label') === 'Toggle navigation'
        )
        await navigationTrigger.click()
        await page.locator('[data-mobile="true"]').waitFor()
        await page.getByRole('button', { name: 'Knowledge', exact: true }).click()
        await page.locator('[data-mobile="true"]').waitFor({ state: 'detached' })
        await navigationTrigger.click()
        await page.getByRole('dialog', { name: 'Primary navigation' }).waitFor()
        await setViewportAndWaitForLayout(page, { width: 1024, height: 1000 })
        await page
          .getByRole('dialog', { name: 'Primary navigation' })
          .waitFor({ state: 'detached' })
        // Focus stays on the toggle, which is the sidebar toggle at desktop width.
        await page.waitForFunction(() =>
          /^(Collapse|Expand) sidebar$/.test(
            document.activeElement?.getAttribute('aria-label') ?? ''
          )
        )
        await auditAccessibility(page, 'navigation mobile to desktop transition')
        await setViewportAndWaitForLayout(page, { width, height: 1000 })
        if (await page.getByRole('dialog', { name: 'Primary navigation' }).count()) {
          throw new Error('Navigation reopened after returning to mobile width')
        }
      }

      if (theme === primaryTheme && width <= 768) {
        await openDestination(page, width, 'Graph')
        await page.locator('.graph-view[data-compact]').waitFor()
        await auditAccessibility(page, `responsive graph/${width}`)
        const overlaps = await page.locator('[data-slot="orbit-item"]').evaluateAll((items) => {
          const boxes = items.map((item) => item.getBoundingClientRect())
          return boxes.some((box, index) =>
            boxes
              .slice(index + 1)
              .some(
                (other) =>
                  box.left < other.right &&
                  box.right > other.left &&
                  box.top < other.bottom &&
                  box.bottom > other.top
              )
          )
        })
        if (overlaps) throw new Error(`Graph nodes overlap at ${width}px`)
        await screenshot(page, `knowledge-graph-${theme}-${width}`)
        const node = page.getByRole('button', { name: /Focus workspace:/ }).first()
        await node.click()
        await page.getByRole('complementary', { name: 'Selected graph node' }).waitFor()
        await node.evaluate(waitForTransitionStylesToSettle)
        await auditAccessibility(page, `selected responsive graph/${width}`)
        await screenshot(page, `knowledge-graph-selected-${theme}-${width}`)
        await openDestination(page, width, 'Knowledge')
      }

      if (theme === primaryTheme && width === 768) {
        await page.getByRole('button', { name: 'Actions' }).click()
        // Menu items select on activation, which closes the menu and can
        // detach the element mid-gesture; a single dispatched keydown is
        // the deterministic activation.
        await page
          .getByRole('menuitem', { name: 'Open sources' })
          .dispatchEvent('keydown', { key: 'Enter' })
        await page.getByRole('dialog', { name: 'Sources and documents' }).waitFor()
        await page
          .getByRole('dialog', { name: 'Sources and documents' })
          .locator('[data-m7-source-panel]')
          .waitFor()
        await auditAccessibility(page, 'mobile sources and documents')
        await screenshot(page, `source-panel-${theme}-768`)
        await page.keyboard.press('Escape')
        await page.getByRole('dialog', { name: 'Sources and documents' }).waitFor({
          state: 'detached',
        })
        await page.waitForFunction(
          () => document.activeElement?.getAttribute('aria-label') === 'Actions'
        )
        for (const action of ['Add source', 'Source settings']) {
          await page.getByRole('button', { name: 'Actions' }).click()
          await page
            .getByRole('menuitem', { name: 'Open sources' })
            .dispatchEvent('keydown', { key: 'Enter' })
          const sourcesDialog = page.getByRole('dialog', { name: 'Sources and documents' })
          await sourcesDialog.waitFor()
          await sourcesDialog.getByRole('button', { name: action, exact: true }).click()
          await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor()
          await sourcesDialog.waitFor({ state: 'detached' })
          await page.waitForFunction(() => document.activeElement?.matches('main.settings-view'))
          await openDestination(page, width, 'Knowledge')
          if (await sourcesDialog.count())
            throw new Error(`${action} left Sources open after returning to Knowledge`)
        }
      }

      if (theme === primaryTheme && width === 1024) {
        await page.getByRole('button', { name: 'Actions' }).click()
        await page
          .getByRole('menuitem', { name: 'Open agent context' })
          .dispatchEvent('keydown', { key: 'Enter' })
        await page.getByRole('dialog', { name: 'Agent context' }).waitFor()
        await page.waitForTimeout(300)
        await auditAccessibility(page, 'tablet agent context boundary')
        await screenshot(page, `context-panel-${theme}-1024`)
        await page.keyboard.press('Escape')
        await page.getByRole('dialog', { name: 'Agent context' }).waitFor({ state: 'detached' })
        await page.waitForFunction(
          () => document.activeElement?.getAttribute('aria-label') === 'Actions'
        )
      }

      if (theme === primaryTheme && width === 1440) {
        const collapsedMetrics = await page.evaluate(() => {
          const rail = document.querySelector('#m7-primary-navigation[data-collapsed="true"]')
          const destination = Array.from(rail?.querySelectorAll('button') ?? []).find(
            (element) => element.textContent?.trim() === 'Knowledge'
          )
          const box = destination?.getBoundingClientRect()
          const rootStyle = getComputedStyle(document.documentElement)
          const expectedWidth =
            Number.parseFloat(rootStyle.getPropertyValue('--rail-width')) *
            Number.parseFloat(rootStyle.fontSize)
          return {
            railWidth: rail?.getBoundingClientRect().width ?? 0,
            expectedWidth,
            targetWidth: box?.width ?? 0,
            targetHeight: box?.height ?? 0,
          }
        })
        if (
          Math.abs(collapsedMetrics.railWidth - collapsedMetrics.expectedWidth) > 1 ||
          collapsedMetrics.targetWidth < 24 ||
          collapsedMetrics.targetHeight < 24
        ) {
          throw new Error(`Shared rail geometry regressed: ${JSON.stringify(collapsedMetrics)}`)
        }

        // The top bar toggle controls the Sources sidebar; the rail itself stays collapsed.
        await page.getByRole('button', { name: 'Collapse sidebar' }).click()
        await page.getByRole('button', { name: 'Expand sidebar' }).waitFor()
        await page.waitForTimeout(300)
        await auditAccessibility(page, 'collapsed sources sidebar')
        await screenshot(page, `sidebar-collapsed-${theme}-1440`)
        await page.getByRole('button', { name: 'Expand sidebar' }).click()
        await page.getByRole('button', { name: 'Collapse sidebar' }).waitFor()
        await page.locator('#m7-primary-navigation[data-collapsed="true"]').waitFor()

        const knowledgeSearch = await openSearchMenu(page)
        await knowledgeSearch.fill('How do releases work?')
        await knowledgeSearch.press('Enter')
        await page.getByRole('heading', { name: 'How do releases work?', level: 1 }).waitFor()
        await auditAccessibility(page, 'populated knowledge answer')
        await screenshot(page, `knowledge-answer-${theme}-1440`)

        await page.getByRole('button', { name: 'Conversations', exact: true }).click()
        await page.getByRole('heading', { name: 'Conversations', level: 1 }).waitFor()
        await auditAccessibility(page, 'populated conversations')
        await screenshot(page, `conversations-${theme}-1440`)
        await page.getByRole('button', { name: 'Knowledge', exact: true }).click()

        await page.getByRole('tab', { name: /Evidence/ }).click()
        await page.getByRole('heading', { name: 'How do releases work?', level: 1 }).waitFor()
        await screenshot(page, `knowledge-evidence-${theme}-1440`)

        await page.getByRole('tab', { name: 'Timeline' }).click()
        await page.locator('.timeline-view').waitFor()
        await screenshot(page, `knowledge-timeline-${theme}-1440`)

        await page.getByRole('option').first().click()
        await page.locator('.canonical-document').waitFor()
        await screenshot(page, `knowledge-document-${theme}-1440`)

        await page.getByRole('button', { name: 'Graph', exact: true }).click()
        await page.locator('.graph-view').waitFor()
        await auditAccessibility(page, 'bounded knowledge graph')
        await screenshot(page, `knowledge-graph-${theme}-1440`)
        await page.getByRole('button', { name: 'Actions' }).click()
        await page
          .getByRole('menuitem', { name: 'Open agent context' })
          .dispatchEvent('keydown', { key: 'Enter' })
        await page.locator('[data-m7-context-panel]').waitFor()
        if (await page.locator('.graph-view').count())
          throw new Error('Open agent context left Graph covering the panel')
        if (await page.getByRole('button', { name: 'Close sources', exact: true }).count())
          throw new Error('Desktop sources exposes a mobile close action')
        if (await page.getByRole('button', { name: 'Close agent context', exact: true }).count())
          throw new Error('Desktop context exposes a mobile close action')
        await auditAccessibility(page, 'context action from Graph')

        await page.getByRole('button', { name: 'Knowledge', exact: true }).click()
        await page.evaluate(() => {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        })
        await page.keyboard.press('Control+p')
        const palette = page.getByRole('dialog', { name: 'Cortana command palette' })
        // The dialog resolves on every platform, but Linux CI has judged it
        // hidden while attached and expanded; record the computed state so
        // the evidence explains which visibility condition the runner sees.
        await palette.waitFor({ state: 'attached' })
        const paletteState = await palette.evaluate((element) => {
          const cs = getComputedStyle(element)
          const box = element.getBoundingClientRect()
          let e = element
          let hiddenAncestor = 'none'
          while (e && e !== document.documentElement) {
            if (e.getAttribute('aria-hidden') === 'true' || e.inert) hiddenAncestor = e.tagName
            e = e.parentElement
          }
          return {
            display: cs.display,
            visibility: cs.visibility,
            box: `${Math.round(box.width)}x${Math.round(box.height)} @ ${Math.round(box.x)},${Math.round(box.y)}`,
            hiddenAncestor,
          }
        })
        console.log(`command palette state: ${JSON.stringify(paletteState)}`)
        if (paletteState.display === 'none' || paletteState.visibility === 'hidden') {
          throw new Error(
            `command palette hidden on this platform: ${JSON.stringify(paletteState)}`
          )
        }
        await page.waitForTimeout(300)
        await auditAccessibility(page, 'production command palette')
        await screenshot(page, `command-${theme}-1440`)
        await page.keyboard.press('Escape')
        await page.waitForFunction(
          () => document.activeElement?.getAttribute('aria-label') === 'Search and reflect'
        )

        await page.getByRole('button', { name: 'Actions' }).click()
        await page
          .getByRole('menuitem', { name: 'Command palette' })
          .dispatchEvent('keydown', { key: 'Enter' })
        await page.getByRole('dialog', { name: 'Cortana command palette' }).waitFor()
        await page.keyboard.press('Escape')
        await page.waitForFunction(
          () => document.activeElement?.getAttribute('aria-label') === 'Actions'
        )

        await page.getByRole('button', { name: /^Switch workspace/ }).click()
        await page.getByRole('menuitemradio', { name: 'Work' }).waitFor()
        await page.waitForTimeout(200)
        await auditAccessibility(page, 'production workspace switcher')
        await screenshot(page, `workspace-menu-${theme}-1440`)
        await page.keyboard.press('Escape')

        await openRailDestination(page, 'Settings')
        await page.locator('.settings-view').waitFor()
        await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor()
        await auditAccessibility(page, 'settings readiness')
        await screenshot(page, `settings-readiness-${theme}-1440`)

        await auditUpdatesSettingsRemoved(page)

        await page.getByRole('tab', { name: 'Services', exact: true }).click()
        await page.getByRole('heading', { name: 'Services', exact: true }).waitFor()
        await auditAccessibility(page, 'settings services and recovery')
        await screenshot(page, `settings-services-recovery-${theme}-1440`)

        await page.getByRole('tab', { name: 'Sources', exact: true }).click()
        await page.getByRole('heading', { name: 'Ingestion sources' }).waitFor()
        const addSource = page.getByRole('button', { name: 'Add source', exact: true })
        await addSource.click()
        const sourceTypeDialog = page.getByRole('dialog', { name: 'Choose a source type' })
        await sourceTypeDialog.waitFor()
        await page.waitForTimeout(300)
        await auditAccessibility(page, 'settings source-type selection')
        await screenshot(page, `settings-source-type-${theme}-1440`)
        await page.keyboard.press('Escape')
        await sourceTypeDialog.waitFor({ state: 'detached' })
        await page.waitForFunction(
          () => document.activeElement?.textContent?.trim() === 'Add source'
        )
        await page.getByRole('button', { name: 'Advanced source settings' }).click()
        await auditAccessibility(page, 'settings configured source')
        await screenshot(page, `settings-source-configured-${theme}-1440`)
        const removeSource = page.getByRole('button', { name: 'Remove work-code' })
        await removeSource.click()
        await page.getByRole('alertdialog').waitFor()
        await page.waitForTimeout(300)
        await auditAccessibility(page, 'settings destructive confirmation')
        await screenshot(page, `settings-source-confirmation-${theme}-1440`)
        // Escape is the confirmation's Cancel: it closes only the confirmation, the
        // source is not removed, and focus returns to the Remove trigger.
        await page.keyboard.press('Escape')
        await page.getByRole('alertdialog').waitFor({ state: 'detached' })
        await removeSource.waitFor()
        await page.waitForFunction(
          () => document.activeElement?.getAttribute('aria-label') === 'Remove work-code'
        )
        // The named Cancel action still works the same way.
        await removeSource.click()
        await page.getByRole('alertdialog').waitFor()
        await page.getByRole('button', { name: 'Cancel' }).click()
        await page.getByRole('alertdialog').waitFor({ state: 'detached' })
        await page.waitForFunction(
          () => document.activeElement?.getAttribute('aria-label') === 'Remove work-code'
        )
        await removeSource.click()
        await page.getByRole('alertdialog').waitFor()
        await page.getByRole('button', { name: 'Continue' }).click()
        await removeSource.waitFor({ state: 'detached' })
        await page.waitForFunction(() => document.activeElement?.textContent?.trim() === 'Sources')

        await page.getByRole('tab', { name: 'Access', exact: true }).click()
        await page.getByRole('heading', { name: 'Agent access' }).waitFor()
        await auditAccessibility(page, 'settings write-only access')
        await screenshot(page, `settings-access-${theme}-1440`)

        const menuTrigger = page.getByRole('button', { name: 'User settings' })
        await menuTrigger.click()
        const accountMenu = page.getByRole('menu')
        await accountMenu.waitFor()
        const menuBounds = await accountMenu.boundingBox()
        if (!menuBounds || menuBounds.x < 0 || menuBounds.x + menuBounds.width > 1440) {
          throw new Error('The desktop account menu overflows the viewport')
        }
        await auditAccessibility(page, 'desktop account menu')
        await screenshot(page, `account-menu-${theme}-1440`)
        await page.keyboard.press('Escape')
        await accountMenu.waitFor({ state: 'detached' })
        await page.waitForFunction(
          () => document.activeElement?.getAttribute('aria-label') === 'User settings'
        )

        await page.getByRole('tab', { name: 'Query', exact: true }).click()
        await page.getByRole('heading', { name: 'Query and answer model' }).waitFor()
        await auditAccessibility(page, 'settings query model selector')
        await screenshot(page, `settings-query-${theme}-1440`)

        await page.getByRole('tab', { name: 'Memory', exact: true }).click()
        await page.getByRole('heading', { name: 'Native agentic memory' }).waitFor()
        await auditAccessibility(page, 'settings memory control center')
        await screenshot(page, `settings-memory-${theme}-1440`)

        await page.getByRole('tab', { name: 'Advanced', exact: true }).click()
        await page.getByRole('heading', { name: 'Local runtime' }).waitFor()
        await auditAccessibility(page, 'settings backup and recovery')
        await screenshot(page, `settings-backup-recovery-${theme}-1440`)

        const collapsedSidebar = page.locator('#m7-primary-navigation[data-collapsed="true"]')
        await collapsedSidebar.waitFor()
        // The merged title bar spans the full window width and the rail starts
        // flush under it: the strip owns the row the window controls sit in,
        // and no gutter may open between the strip's bottom edge and the rail.
        await page.waitForFunction(() => {
          const sidebar = document.querySelector('#m7-primary-navigation[data-collapsed="true"]')
          const header = document.querySelector('.m7-production-shell [data-slot="shell-top-bar"]')
          if (!sidebar || !header) return false
          const sidebarBox = sidebar.getBoundingClientRect()
          const headerBox = header.getBoundingClientRect()
          return (
            headerBox.x <= 1 &&
            Math.abs(headerBox.x + headerBox.width - window.innerWidth) <= 1 &&
            Math.abs(sidebarBox.y - headerBox.y - headerBox.height) <= 1
          )
        })
        const [sidebarBox, headerBox] = await Promise.all([
          collapsedSidebar.boundingBox(),
          page.locator('.m7-production-shell [data-slot="shell-top-bar"]').boundingBox(),
        ])
        if (
          !sidebarBox ||
          !headerBox ||
          headerBox.x > 1 ||
          Math.abs(sidebarBox.y - headerBox.y - headerBox.height) > 1
        ) {
          throw new Error(
            'Collapsed desktop sidebar must start flush under the full-width title strip'
          )
        }
      }

      await context.close()
    }
  }

  for (const width of widths) {
    const { context, page } = await openPage(primaryTheme, width)
    const search = await openSearchMenu(page)
    await search.fill('How do releases work?')
    await search.press('Enter')
    await page.getByRole('heading', { name: 'How do releases work?', level: 1 }).waitFor()

    for (const destination of ['Inbox', 'Conversations', 'Agent tools', 'Index', 'Help Center']) {
      await openDestination(page, width, destination)
      await auditAccessibility(page, `${destination} at ${width}px`)
      const horizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      )
      if (horizontalOverflow) throw new Error(`${destination} overflows horizontally at ${width}px`)
      await screenshot(
        page,
        `${destination.toLowerCase().replaceAll(' ', '-')}-${primaryTheme}-${width}`
      )
    }
    await context.close()
  }

  for (const theme of themes) {
    for (const width of widths) {
      if (theme === primaryTheme && width === 1440) continue
      const { context, page } = await openPage(theme, width)
      await openSettings(page, width)
      await auditAccessibility(page, `configured settings ${theme}/${width}`)
      await screenshot(page, `settings-configured-${theme}-${width}`)
      await auditUpdatesSettingsRemoved(page)
      await context.close()
    }
  }

  for (const state of [
    'setup',
    'busy',
    'success',
    'warning',
    'failure',
    'cancelled',
    'retry',
    'recovery',
  ]) {
    const { context, page } = await openPage(primaryTheme, 1440, state)
    await openSettings(page, 1440)
    if (state === 'success') {
      await page.getByRole('tab', { name: 'Services', exact: true }).click()
      await page.getByRole('heading', { name: 'Services', exact: true }).waitFor()
    }
    await auditAccessibility(page, `${state} settings state`)
    await screenshot(page, `settings-state-${state}-${primaryTheme}-1440`)
    await context.close()
  }

  const zoomContext = await browser.newContext({
    viewport: { width: 720, height: 500 },
    deviceScaleFactor: 2,
  })
  const zoomPage = await zoomContext.newPage()
  await zoomPage.goto(`${baseUrl}/?demo=1&renderer=shadcn`, { waitUntil: 'domcontentloaded' })
  await zoomPage.locator('[data-m7-production-shell-ready]').waitFor({ state: 'attached' })
  await openSettings(zoomPage, 720)
  await auditAccessibility(zoomPage, 'settings at 200% zoom')
  const horizontalOverflow = await zoomPage.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  )
  if (horizontalOverflow) throw new Error('The production shadcn shell overflows at 200% zoom')
  await zoomContext.close()

  const compactContext = await browser.newContext({ viewport: { width: 790, height: 800 } })
  const compactPage = await compactContext.newPage()
  await compactPage.goto(`${baseUrl}/?demo=1&renderer=shadcn`, {
    waitUntil: 'domcontentloaded',
  })
  await compactPage.locator('[data-m7-production-shell-ready]').waitFor({ state: 'attached' })
  const compactLayout = await compactPage.evaluate(() => {
    const source = document.querySelector('[data-m7-source-panel]')
    const workspace = document.querySelector('#main-content')
    if (!workspace) return null
    return {
      sourcePosition: source ? getComputedStyle(source).position : 'unmounted',
      sourceRight: source ? source.getBoundingClientRect().right : -1,
      workspaceWidth: workspace.getBoundingClientRect().width,
    }
  })
  if (
    !compactLayout ||
    !['fixed', 'unmounted'].includes(compactLayout.sourcePosition) ||
    compactLayout.sourceRight > 1 ||
    compactLayout.workspaceWidth < 700
  ) {
    throw new Error('The 781–799px compact shell leaves the source pane in the workspace flow')
  }
  await compactContext.close()

  const motionContext = await browser.newContext({
    viewport: { width: 768, height: 800 },
    reducedMotion: 'reduce',
  })
  const motionPage = await motionContext.newPage()
  await motionPage.goto(`${baseUrl}/?demo=1`, {
    waitUntil: 'domcontentloaded',
  })
  await motionPage.locator('[data-m7-production-shell-ready]').waitFor({ state: 'attached' })
  const navigationTrigger = motionPage.getByRole('button', { name: 'Toggle navigation' })
  await navigationTrigger.focus()
  await navigationTrigger.press('Enter')
  const mobileNavigation = motionPage.locator('[data-mobile="true"]')
  await mobileNavigation.waitFor()
  const animationDuration = await mobileNavigation.evaluate(
    (element) => getComputedStyle(element).animationDuration
  )
  if (Number.parseFloat(animationDuration) > 0.00002) {
    throw new Error(`Reduced-motion navigation animation remained ${animationDuration}`)
  }
  await motionPage.keyboard.press('Escape')
  await mobileNavigation.waitFor({ state: 'detached' })
  await motionPage.waitForFunction(
    () => document.activeElement?.getAttribute('aria-label') === 'Toggle navigation'
  )
  await motionContext.close()
}

// The System status popover follows the header when the bar wraps or unwraps
// while it is open. A text-size change resizes the bar without resizing the
// window or moving the trigger, so only an observer on the bar notices it; a
// popover that waits for floating-ui's one-second layout-shift fallback fails
// the half-second budget below.
{
  const popoverContext = await browser.newContext({
    viewport: { width: 390, height: 1000 },
    reducedMotion: 'reduce',
  })
  await popoverContext.addInitScript(
    (value) =>
      localStorage.setItem(
        'cortana.workspace-themes.v1',
        JSON.stringify({ work: value, personal: value })
      ),
    primaryTheme
  )
  const popoverPage = await popoverContext.newPage()
  popoverPage.setDefaultTimeout(60_000)
  await popoverPage.goto(`${baseUrl}/?demo=1&demo-state=configured`, {
    waitUntil: 'domcontentloaded',
  })
  await popoverPage.locator('[data-m7-production-shell-ready]').waitFor({ state: 'attached' })
  await popoverPage.getByRole('button', { name: 'Search and reflect' }).waitFor()
  await popoverPage.getByRole('button', { name: 'System status', exact: true }).click()
  await popoverPage.locator('[aria-label="System status details"]').waitFor()

  const settleBudgetMs = 500
  // The shell top bar scales with the root font size instead of wrapping, but
  // the popover must still re-anchor on every resize or zoom: just under the
  // trigger on a single row, or below the bar if a layout ever wraps.
  // expectWrapped: true requires a two-row bar, false a single row, undefined either.
  const popoverPlacement = (expectWrapped) =>
    popoverPage
      .waitForFunction(
        (wrapped) => {
          const bar = document.querySelector('[data-slot="shell-top-bar"]')?.getBoundingClientRect()
          const trigger = document
            .querySelector('[aria-label="System status"]')
            ?.getBoundingClientRect()
          const popover = document
            .querySelector('[aria-label="System status details"]')
            ?.getBoundingClientRect()
          if (!bar || !trigger || !popover) return false
          const isWrapped = bar.bottom - trigger.bottom >= 24
          if (wrapped !== undefined && isWrapped !== wrapped) return false
          return isWrapped
            ? popover.top >= bar.bottom - 2
            : popover.top >= trigger.bottom && popover.top - trigger.bottom <= 20
        },
        expectWrapped,
        { timeout: settleBudgetMs, polling: 'raf' }
      )
      .catch(() => {
        throw new Error(
          `System status popover did not settle ${expectWrapped === undefined ? 'against its trigger' : expectWrapped ? 'below the wrapped bar' : 'under the trigger'} within ${settleBudgetMs}ms`
        )
      })

  await popoverPlacement()
  await popoverPage.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
  })
  await popoverPlacement()
  await popoverPage.evaluate(() => {
    document.documentElement.style.fontSize = ''
  })
  await popoverPlacement()
  // Window resizes keep the popover anchored at the narrow and the wide width.
  await popoverPage.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
  })
  await popoverPlacement()
  await popoverPage.setViewportSize({ width: 1100, height: 1000 })
  await popoverPlacement()
  await popoverPage.setViewportSize({ width: 390, height: 1000 })
  await popoverPlacement()
  // Strict wrapped case: at 320px with 200% text the bar must wrap to two rows,
  // and the popover must settle below the second row, not over the content.
  await popoverPage.setViewportSize({ width: 320, height: 1000 })
  await popoverPage.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
  })
  await popoverPlacement(true)
  await popoverPage.evaluate(() => {
    document.documentElement.style.fontSize = ''
  })
  await popoverPlacement(false)
  await popoverContext.close()
}

// The header's keyboard order follows its visual order, including in the
// two-row bar that a narrow window or enlarged text produces. The finding
// #2599 recorded is the bar's centre slot: its control was drawn on the
// second row and still tabbed before the trailing group, so the focus dropped
// to the second row and returned to the first.
{
  const keyboardContext = await browser.newContext({
    viewport: { width: 320, height: 1000 },
    reducedMotion: 'reduce',
  })
  await keyboardContext.addInitScript(
    (value) =>
      localStorage.setItem(
        'cortana.workspace-themes.v1',
        JSON.stringify({ work: value, personal: value })
      ),
    primaryTheme
  )
  const keyboardPage = await keyboardContext.newPage()
  keyboardPage.setDefaultTimeout(60_000)
  await keyboardPage.goto(`${baseUrl}/?demo=1&demo-state=configured`, {
    waitUntil: 'domcontentloaded',
  })
  await keyboardPage.locator('[data-m7-production-shell-ready]').waitFor({ state: 'attached' })
  await keyboardPage.getByRole('button', { name: 'Search and reflect' }).waitFor()

  const checkHeaderOrder = async (label) => {
    const { visual, keyboard } = await headerControlOrders(keyboardPage)
    const visualNames = visual.map((control) => control.name)
    const keyboardNames = keyboard.map((control) => control.name)
    if (keyboardNames.join(' → ') !== visualNames.join(' → ')) {
      throw new Error(
        `The header's keyboard order does not follow its visual order (${label}):\n` +
          `  keyboard: ${keyboardNames.join(' → ')}\n` +
          `  visual:   ${visualNames.join(' → ')}`
      )
    }
    const outside = keyboard.filter((control) => !control.insideViewport)
    if (outside.length > 0) {
      throw new Error(
        `The header's keyboard order reaches controls outside the viewport (${label}): ${outside
          .map((control) => control.name)
          .join(', ')}`
      )
    }
    return visual
  }

  // 200% text at 320px wraps the bar: the navigation toggle on the first row
  // and the trailing group on the second. The check only means something while
  // the bar is wrapped, so the rows are counted too.
  await keyboardPage.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
  })
  await waitForHeaderLayoutToSettle(keyboardPage)
  const wrapped = await checkHeaderOrder('320px at 200% text')
  const rows = new Set(wrapped.map((control) => control.row)).size
  if (rows < 2) {
    throw new Error(
      'The header did not wrap at 320px with 200% text, so the keyboard order was not checked against a two-row bar'
    )
  }
  await screenshot(keyboardPage, 'header-keyboard-order-320-200')
  await keyboardPage.evaluate(() => {
    document.documentElement.style.fontSize = ''
  })
  await waitForHeaderLayoutToSettle(keyboardPage)
  await checkHeaderOrder('320px at 100% text')
  await screenshot(keyboardPage, 'header-keyboard-order-320-100')
  await keyboardContext.close()
}

await browser.close()

if (consoleErrors.length > 0) {
  throw new Error(`Browser console errors:\n${consoleErrors.join('\n')}`)
}

console.log(`Captured ${screenshotCount} final-renderer screenshots in ${output}`)

#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { AxeBuilder } from '@axe-core/playwright'
import { chromium, webkit } from 'playwright'
import { themesForAppearance } from '@adea-ai/ui/lib/themes'
import { setViewportAndWaitForLayout } from './knowledge-accessibility-browser.mjs'

const args = new Map()
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1])
}

const baseUrl = args.get('--base-url') ?? 'http://127.0.0.1:4173'
const output = resolve(args.get('--output') ?? 'artifacts/m7-shadcn/final')
// Destinations that live behind the rail's single utilities trigger rather
// than on a row of their own.
const MENU_DESTINATIONS = new Set(['Settings', 'Updates', 'Index', 'Help'])
const widths = args.has('--widths')
  ? args.get('--widths').split(',').map(Number)
  : [320, 768, 1024, 1440, 1920]
const themes = args.has('--themes')
  ? args.get('--themes').split(',')
  : [
      'blue',
      ...themesForAppearance('dark')
        .map((theme) => theme.id)
        .filter((id) => id !== 'nord'),
    ]
const consoleErrors = []
let screenshotCount = 0

await mkdir(output, { recursive: true })
const engine = args.get('--browser') ?? 'chromium'
if (!['chromium', 'webkit'].includes(engine)) throw new Error(`Unsupported browser: ${engine}`)
const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true })

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
  const rawWaitForFunction = page.waitForFunction.bind(page)
  page.waitForFunction = (...callArgs) => {
    const frames = (new Error().stack ?? '')
      .split('\n')
      .filter((line) => line.includes('capture-m7-visuals.mjs:'))
      .map((line) => line.trim().slice(0, 90))
    const caller = frames.find((line) => !line.includes(':58:')) ?? frames[0]
    console.log(`WFF-CALL ${caller}`)
    return rawWaitForFunction(...callArgs).catch(async (error) => {
      let focusState = 'unavailable'
      try {
        focusState = await page.evaluate(() => {
          const a = document.activeElement
          return `${a?.tagName} [${(a?.getAttribute('aria-label') ?? a?.textContent ?? '').toString().slice(0, 40)}]`
        })
      } catch {}
      console.log(
        `WFF-FAIL ${caller} focus=${focusState} console=${JSON.stringify(consoleErrors.slice(0, 3))}`
      )
      throw error
    })
  }
  page.setDefaultTimeout(60_000)
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(`${theme}/${width}: ${message.text()}`)
    }
  })
  await page.goto(`${baseUrl}/?demo=1&demo-state=${state}`, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-m7-production-shell-ready]').waitFor({ state: 'attached' })
  await page.getByRole('textbox', { name: 'Search your knowledge' }).waitFor()
  return { context, page }
}

// The rail footer keeps one utilities trigger: Settings, Updates, Index, and
// Help are reached by opening its menu and choosing the destination.
async function openRailDestination(page, destination) {
  // The compact rail folds these destinations into one trigger; the mobile
  // sheet keeps them as rows, so a missing trigger means a direct row click.
  const trigger = page.getByRole('button', { name: 'Settings and utilities' })
  if ((await trigger.count()) === 0) {
    await page.getByRole('button', { name: destination, exact: true }).click()
    return
  }
  await trigger.click()
  await page.getByRole('menuitem', { name: destination, exact: true }).click()
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

async function openDestination(page, width, destination) {
  if (width <= 768) {
    await page.getByRole('button', { name: 'Toggle navigation' }).click()
    await page.locator('[data-mobile="true"]').waitFor()
  }
  if (MENU_DESTINATIONS.has(destination)) await openRailDestination(page, destination)
  else await page.getByRole('button', { name: destination, exact: true }).click()
  if (width <= 768) await page.locator('[data-mobile="true"]').waitFor({ state: 'detached' })
  if (destination === 'Knowledge') await page.locator('.workspace').waitFor()
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

async function auditAccessibility(page, label) {
  await page.evaluate(() => document.fonts.ready)
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

{
  for (const theme of themes) {
    for (const width of widths) {
      const { context, page } = await openPage(theme, width)
      if (theme === 'blue' && width === 320) {
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

      if (theme === 'blue' && width === 320) {
        const mobileSearch = page.getByRole('textbox', { name: 'Search your knowledge' })
        await mobileSearch.fill('How do releases work?')
        await mobileSearch.press('Enter')
        await page.getByRole('heading', { name: 'How do releases work?', level: 1 }).waitFor()
        await auditAccessibility(page, 'mobile populated knowledge answer')
        await screenshot(page, 'knowledge-answer-blue-320')

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
        await screenshot(page, 'mobile-navigation-blue-320')
        await page.getByRole('button', { name: 'Knowledge', exact: true }).click()
        await page.locator('[data-mobile="true"]').waitFor({ state: 'detached' })
        await navigationTrigger.click()
        await page.getByRole('dialog', { name: 'Primary navigation' }).waitFor()
        await setViewportAndWaitForLayout(page, { width: 1024, height: 1000 })
        await page
          .getByRole('dialog', { name: 'Primary navigation' })
          .waitFor({ state: 'detached' })
        await page.waitForFunction(
          () => document.activeElement?.getAttribute('aria-label') === 'Toggle navigation'
        )
        await auditAccessibility(page, 'navigation mobile to desktop transition')
        await setViewportAndWaitForLayout(page, { width, height: 1000 })
        if (await page.getByRole('dialog', { name: 'Primary navigation' }).count()) {
          throw new Error('Navigation reopened after returning to mobile width')
        }
      }

      if (theme === 'blue' && width <= 768) {
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
        await screenshot(page, `knowledge-graph-blue-${width}`)
        const node = page.getByRole('button', { name: /Focus workspace:/ }).first()
        await node.click()
        await page.getByRole('complementary', { name: 'Selected graph node' }).waitFor()
        await auditAccessibility(page, `selected responsive graph/${width}`)
        await screenshot(page, `knowledge-graph-selected-blue-${width}`)
        await openDestination(page, width, 'Knowledge')
      }

      if (theme === 'blue' && width === 768) {
        await page.getByRole('button', { name: 'Actions' }).click()
        // Menu items select on activation, which closes the menu and can
        // detach the element mid-gesture; a single dispatched keydown is
        // the deterministic activation.
        await page
          .getByRole('menuitem', { name: 'Open sources' })
          .dispatchEvent('keydown', { key: 'Enter' })
        await page.getByRole('dialog', { name: 'Sources and documents' }).waitFor()
        await page.locator('aside.source-panel.mobile-open').waitFor()
        await auditAccessibility(page, 'mobile sources and documents')
        await screenshot(page, 'source-panel-blue-768')
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

      if (theme === 'blue' && width === 1024) {
        await page.getByRole('button', { name: 'Actions' }).click()
        await page
          .getByRole('menuitem', { name: 'Open agent context' })
          .dispatchEvent('keydown', { key: 'Enter' })
        await page.getByRole('dialog', { name: 'Agent context' }).waitFor()
        await page.waitForTimeout(300)
        await auditAccessibility(page, 'tablet agent context boundary')
        await screenshot(page, 'context-panel-blue-1024')
        await page.keyboard.press('Escape')
        await page.getByRole('dialog', { name: 'Agent context' }).waitFor({ state: 'detached' })
        await page.waitForFunction(
          () => document.activeElement?.getAttribute('aria-label') === 'Actions'
        )
      }

      if (theme === 'blue' && width === 1440) {
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

        await page.getByRole('button', { name: 'Toggle navigation' }).click()
        await page.locator('#m7-primary-navigation[data-collapsed="false"]').waitFor()
        await page.waitForTimeout(300)
        const expandedGeometry = await page
          .locator('#m7-primary-navigation')
          .evaluate((element) => {
            const rootStyle = getComputedStyle(document.documentElement)
            return {
              actual: element.getBoundingClientRect().width,
              expected:
                Number.parseFloat(rootStyle.getPropertyValue('--rail-width-expanded')) *
                Number.parseFloat(rootStyle.fontSize),
            }
          })
        if (Math.abs(expandedGeometry.actual - expandedGeometry.expected) > 1) {
          throw new Error(
            `Expanded shared rail geometry regressed: ${JSON.stringify(expandedGeometry)}`
          )
        }
        await auditAccessibility(page, 'expanded desktop navigation')
        await screenshot(page, 'sidebar-expanded-blue-1440')
        await page.getByRole('button', { name: 'Toggle navigation' }).click()
        await page.locator('#m7-primary-navigation[data-collapsed="true"]').waitFor()

        const knowledgeSearch = page.getByRole('textbox', { name: 'Search your knowledge' })
        await knowledgeSearch.fill('How do releases work?')
        await knowledgeSearch.press('Enter')
        await page.getByRole('heading', { name: 'How do releases work?', level: 1 }).waitFor()
        await auditAccessibility(page, 'populated knowledge answer')
        await screenshot(page, 'knowledge-answer-blue-1440')

        await page.getByRole('button', { name: 'Conversations', exact: true }).click()
        await page.getByRole('heading', { name: 'Conversations', level: 1 }).waitFor()
        await auditAccessibility(page, 'populated conversations')
        await screenshot(page, 'conversations-blue-1440')
        await page.getByRole('button', { name: 'Knowledge', exact: true }).click()

        await page.getByRole('tab', { name: /Evidence/ }).click()
        await page.getByRole('heading', { name: 'How do releases work?', level: 1 }).waitFor()
        await screenshot(page, 'knowledge-evidence-blue-1440')

        await page.getByRole('tab', { name: 'Timeline' }).click()
        await page.locator('.timeline-view').waitFor()
        await screenshot(page, 'knowledge-timeline-blue-1440')

        await page.getByRole('option').first().click()
        await page.locator('.canonical-document').waitFor()
        await screenshot(page, 'knowledge-document-blue-1440')

        await page.getByRole('button', { name: 'Graph', exact: true }).click()
        await page.locator('.graph-view').waitFor()
        await auditAccessibility(page, 'bounded knowledge graph')
        await screenshot(page, 'knowledge-graph-blue-1440')
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
        await screenshot(page, 'command-blue-1440')
        await page.keyboard.press('Escape')
        await page.waitForFunction(
          () => document.activeElement?.getAttribute('aria-label') === 'Search your knowledge'
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

        await page.getByRole('button', { name: 'Switch workspace' }).click()
        await page.getByRole('menuitemradio', { name: 'Work' }).waitFor()
        await page.waitForTimeout(200)
        await auditAccessibility(page, 'production workspace switcher')
        await screenshot(page, 'workspace-menu-blue-1440')
        await page.keyboard.press('Escape')

        await openRailDestination(page, 'Settings')
        await page.locator('.settings-view').waitFor()
        await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor()
        await auditAccessibility(page, 'settings readiness')
        await screenshot(page, 'settings-readiness-blue-1440')

        await page.getByRole('button', { name: 'Services', exact: true }).click()
        await page.getByRole('heading', { name: 'Services', exact: true }).waitFor()
        await auditAccessibility(page, 'settings services and recovery')
        await screenshot(page, 'settings-services-recovery-blue-1440')

        await page.getByRole('button', { name: 'Sources', exact: true }).click()
        await page.getByRole('heading', { name: 'Ingestion sources' }).waitFor()
        const addSource = page.getByRole('button', { name: 'Add source', exact: true })
        await addSource.click()
        const sourceTypeDialog = page.getByRole('dialog', { name: 'Choose a source type' })
        await sourceTypeDialog.waitFor()
        await page.waitForTimeout(300)
        await auditAccessibility(page, 'settings source-type selection')
        await screenshot(page, 'settings-source-type-blue-1440')
        await page.keyboard.press('Escape')
        await sourceTypeDialog.waitFor({ state: 'detached' })
        await page.waitForFunction(
          () => document.activeElement?.textContent?.trim() === 'Add source'
        )
        await page.getByRole('button', { name: 'Advanced source settings' }).click()
        await auditAccessibility(page, 'settings configured source')
        await screenshot(page, 'settings-source-configured-blue-1440')
        const removeSource = page.getByRole('button', { name: 'Remove work-code' })
        await removeSource.click()
        await page.getByRole('alertdialog').waitFor()
        await page.waitForTimeout(300)
        await auditAccessibility(page, 'settings destructive confirmation')
        await screenshot(page, 'settings-source-confirmation-blue-1440')
        // The shared alert dialog deliberately ignores Escape — a destructive
        // confirmation wants an explicit choice — so dismiss through Cancel,
        // which restores focus to the Remove trigger.
        await page.getByRole('button', { name: 'Cancel' }).click()
        await page.waitForFunction(
          () => document.activeElement?.getAttribute('aria-label') === 'Remove work-code'
        )
        await removeSource.click()
        await page.getByRole('alertdialog').waitFor()
        await page.getByRole('button', { name: 'Continue' }).click()
        await removeSource.waitFor({ state: 'detached' })
        await page.waitForFunction(() => document.activeElement?.textContent?.trim() === 'Sources')

        await page.getByRole('button', { name: 'Access', exact: true }).click()
        await page.getByRole('heading', { name: 'Agent access' }).waitFor()
        await auditAccessibility(page, 'settings write-only access')
        await screenshot(page, 'settings-access-blue-1440')

        await page.getByRole('button', { name: 'Updates', exact: true }).click()
        await page.getByRole('heading', { name: 'Updates', exact: true }).waitFor()
        await screenshot(page, 'settings-updater-blue-1440')

        await page.getByRole('button', { name: 'Query', exact: true }).click()
        await page.getByRole('heading', { name: 'Query and answer model' }).waitFor()
        await auditAccessibility(page, 'settings query model selector')
        await screenshot(page, 'settings-query-blue-1440')

        await page.getByRole('button', { name: 'Memory', exact: true }).click()
        await page.getByRole('heading', { name: 'Native agentic memory' }).waitFor()
        await auditAccessibility(page, 'settings memory control center')
        await screenshot(page, 'settings-memory-blue-1440')

        await page.getByRole('button', { name: 'Advanced', exact: true }).click()
        await page.getByRole('heading', { name: 'Local runtime' }).waitFor()
        await auditAccessibility(page, 'settings backup and recovery')
        await screenshot(page, 'settings-backup-recovery-blue-1440')

        const collapsedSidebar = page.locator('#m7-primary-navigation[data-collapsed="true"]')
        await collapsedSidebar.waitFor()
        // The merged title bar spans the full window width and the rail starts
        // flush under it: the strip owns the row the window controls sit in,
        // and no gutter may open between the strip's bottom edge and the rail.
        await page.waitForFunction(() => {
          const sidebar = document.querySelector('#m7-primary-navigation[data-collapsed="true"]')
          const header = document.querySelector('.m7-production-shell [data-slot="top-bar"]')
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
          page.locator('.m7-production-shell [data-slot="top-bar"]').boundingBox(),
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
    const { context, page } = await openPage('blue', width)
    const search = page.getByRole('textbox', { name: 'Search your knowledge' })
    await search.fill('How do releases work?')
    await search.press('Enter')
    await page.getByRole('heading', { name: 'How do releases work?', level: 1 }).waitFor()

    for (const destination of ['Inbox', 'Conversations', 'Agent tools', 'Index', 'Help']) {
      await openDestination(page, width, destination)
      await auditAccessibility(page, `${destination} at ${width}px`)
      const horizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      )
      if (horizontalOverflow) throw new Error(`${destination} overflows horizontally at ${width}px`)
      await screenshot(page, `${destination.toLowerCase().replaceAll(' ', '-')}-blue-${width}`)
    }
    await context.close()
  }

  for (const theme of themes) {
    for (const width of widths) {
      if (theme === 'blue' && width === 1440) continue
      const { context, page } = await openPage(theme, width)
      await openSettings(page, width)
      await auditAccessibility(page, `configured settings ${theme}/${width}`)
      await screenshot(page, `settings-configured-${theme}-${width}`)
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
    const { context, page } = await openPage('blue', 1440, state)
    await openSettings(page, 1440)
    if (state === 'success') {
      await page.getByRole('button', { name: 'Services', exact: true }).click()
      await page.getByRole('heading', { name: 'Services', exact: true }).waitFor()
    }
    await auditAccessibility(page, `${state} settings state`)
    await screenshot(page, `settings-state-${state}-blue-1440`)
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
    const source = document.querySelector('.source-panel')
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

await browser.close()

if (consoleErrors.length > 0) {
  throw new Error(`Browser console errors:\n${consoleErrors.join('\n')}`)
}

console.log(`Captured ${screenshotCount} final-renderer screenshots in ${output}`)

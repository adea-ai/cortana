#!/usr/bin/env node
// Uses the real production App: component-only fixtures cannot catch app CSS overrides.
import { chromium } from 'playwright'

export async function assertSharedUiCascade(page, { requireBoth = false } = {}) {
  await page.mouse.move(0, 0)
  const result = await page.evaluate(() => {
    const primary = [...document.querySelectorAll('button.bg-primary')].filter(
      (element) => element.getClientRects().length > 0
    )
    const bordered = [...document.querySelectorAll('button.border')].filter(
      (element) => element.getClientRects().length > 0
    )
    const failures = []
    for (const element of primary) {
      const probe = document.createElement('span')
      probe.style.backgroundColor = 'var(--primary)'
      element.append(probe)
      const expected = getComputedStyle(probe).backgroundColor
      const actual = getComputedStyle(element).backgroundColor
      probe.remove()
      if (actual !== expected)
        failures.push(`${element.textContent?.trim()}: background ${actual}, expected ${expected}`)
    }
    for (const element of bordered) {
      if (Number.parseFloat(getComputedStyle(element).borderTopWidth) === 0)
        failures.push(`${element.textContent?.trim()}: shared border utility was overridden`)
    }
    return { primary: primary.length, bordered: bordered.length, failures }
  })
  if (requireBoth && (result.primary === 0 || result.bordered === 0))
    throw new Error(`Production settings controls were not exercised: ${JSON.stringify(result)}`)
  if (result.failures.length) throw new Error(`Shared UI cascade failed: ${JSON.stringify(result)}`)
  return result
}

if (import.meta.main) {
  const baseUrl = process.env.CORTANA_UI_BASE_URL
  if (!baseUrl) throw new Error('Set CORTANA_UI_BASE_URL to the disposable web server')
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: 'reduce',
    })
    await page.goto(`${baseUrl}/?demo=1&demo-state=configured`, { waitUntil: 'domcontentloaded' })
    await page.locator('[data-m7-production-shell-ready]').waitFor({ state: 'attached' })
    await page.getByRole('button', { name: 'Settings and utilities' }).click()
    await page.getByRole('menuitem', { name: 'Settings', exact: true }).click()
    await page.locator('.settings-view').waitFor()
    const result = await assertSharedUiCascade(page, { requireBoth: true })
    const font = await page
      .locator('html')
      .evaluate((element) => getComputedStyle(element).fontFamily)
    if (!font.includes('Geist')) throw new Error(`Shared Geist font selection failed: ${font}`)
    console.log(JSON.stringify({ ...result, font }))
  } finally {
    await browser.close()
  }
}

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { APPEARANCE_STORAGE_KEY, DEFAULT_THEME } from './theme'
import { themeBootSource } from './themeBoot'

const root = () => document.documentElement

function runBoot(stored?: unknown) {
  localStorage.clear()
  if (stored !== undefined) localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(stored))
  // oxlint-disable-next-line no-new-func -- the boot script is a string by design
  new Function(themeBootSource())()
}

describe('theme boot script', () => {
  beforeEach(() => {
    root().removeAttribute('data-theme')
    root().removeAttribute('data-appearance')
    root().classList.remove('dark')
  })
  afterEach(() => localStorage.clear())

  test('paints the stored workspace theme before the app mounts', () => {
    runBoot({ appearance: 'dark', darkThemeId: 'nord' })
    expect(root().dataset['theme']).toBe('nord')
    expect(root().dataset['appearance']).toBe('dark')
    expect(root().classList.contains('dark')).toBe(true)
  })

  test('is dark with the default theme on a first launch, whatever the system prefers', () => {
    // Nothing stored: the shared script resolves `system`, which Cortana never offers.
    runBoot()
    expect(root().dataset['theme']).toBe(DEFAULT_THEME)
    expect(root().dataset['appearance']).toBe('dark')
    expect(root().classList.contains('dark')).toBe(true)
    expect(root().style.colorScheme).toBe('dark')
  })

  test('falls back to the default theme for a stored id the catalogue lacks', () => {
    runBoot({ appearance: 'dark', darkThemeId: 'retired-theme' })
    expect(root().dataset['theme']).toBe(DEFAULT_THEME)
  })

  test('forces dark over a stored light preference', () => {
    runBoot({ appearance: 'light', lightThemeId: 'adea-light' })
    expect(root().dataset['appearance']).toBe('dark')
    expect(root().dataset['theme']).toBe(DEFAULT_THEME)
  })
})

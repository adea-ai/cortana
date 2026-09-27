import { afterEach, expect, test } from 'bun:test'
import {
  DEFAULT_THEME,
  LEGACY_THEME_TO_CANONICAL_ID,
  SUPPORTED_THEMES,
  applyTheme,
  isThemeMode,
  resolveThemeMode,
} from './theme'

const root = document.documentElement

afterEach(() => {
  root.removeAttribute('style')
  root.removeAttribute('data-theme')
  root.removeAttribute('data-appearance')
  root.classList.remove('dark')
})

test('keeps saved Cortana theme ids while mapping them to distinct shared palettes', () => {
  expect(Object.keys(LEGACY_THEME_TO_CANONICAL_ID)).toEqual(SUPPORTED_THEMES.map(({ id }) => id))
  expect(new Set(Object.values(LEGACY_THEME_TO_CANONICAL_ID)).size).toBe(SUPPORTED_THEMES.length)
  expect(resolveThemeMode('graphite')).toBe('graphite')
  expect(resolveThemeMode('removed-theme')).toBe(DEFAULT_THEME)
  expect(isThemeMode(null)).toBe(false)
})

test('applies shared semantic theme tokens without changing persisted ids', async () => {
  for (const { id } of SUPPORTED_THEMES) {
    await applyTheme(id)

    expect(root.getAttribute('data-theme')).toBe(id)
    expect(root.style.getPropertyValue('--background')).not.toBe('')
    expect(root.style.getPropertyValue('--primary')).not.toBe('')
    expect(root.style.getPropertyValue('--cortana-paper-background')).not.toBe('')
    expect(root.getAttribute('data-appearance')).toMatch(/^(light|dark)$/)
    expect(root.classList.contains('dark')).toBe(root.getAttribute('data-appearance') === 'dark')
  }
})

test('a late palette import cannot replace the current workspace theme', async () => {
  const stale = applyTheme('blue')
  const current = applyTheme('rose')

  await Promise.all([stale, current])

  expect(root.getAttribute('data-theme')).toBe('rose')
})

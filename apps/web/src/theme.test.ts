import { describe, expect, test } from 'bun:test'
import { themesForAppearance } from '@adea-ai/ui/lib/themes'
import { DEFAULT_THEME, LEGACY_THEME_MAP, normalizeThemeId, themeDisplayName } from './theme'

describe('normalizeThemeId', () => {
  test('falls back to the default for absent and unknown values', () => {
    expect(normalizeThemeId(null)).toBe(DEFAULT_THEME)
    expect(normalizeThemeId(undefined)).toBe(DEFAULT_THEME)
    expect(normalizeThemeId('')).toBe(DEFAULT_THEME)
    expect(normalizeThemeId('not-a-theme')).toBe(DEFAULT_THEME)
  })

  test('passes catalogue ids through unchanged', () => {
    expect(normalizeThemeId('nord')).toBe('nord')
    expect(normalizeThemeId('adea-dark')).toBe('adea-dark')
  })

  test('maps every pre-catalogue id onto its replacement', () => {
    expect(normalizeThemeId('graphite')).toBe('adea-dark')
    expect(normalizeThemeId('rose')).toBe('rosepine-moon')
    expect(normalizeThemeId('accessible')).toBe('contrast-dark')
    for (const replacement of Object.values(LEGACY_THEME_MAP)) {
      expect(normalizeThemeId(replacement)).toBe(replacement)
    }
  })

  test('legacy replacements stay valid dark catalogue ids', () => {
    // Guards against catalogue drift: a renamed or removed theme would silently
    // reset every workspace holding the old id.
    const darkIds = new Set(themesForAppearance('dark').map((theme) => theme.id))
    for (const replacement of Object.values(LEGACY_THEME_MAP)) {
      expect(darkIds.has(replacement)).toBe(true)
    }
  })
})

describe('themeDisplayName', () => {
  test('uses the family when the variant label adds nothing', () => {
    expect(themeDisplayName({ label: 'Dark', familyLabel: 'Everforest' })).toBe('Everforest')
    expect(themeDisplayName({ label: 'Nord', familyLabel: 'Nord' })).toBe('Nord')
    expect(themeDisplayName({ label: 'Night', familyLabel: 'Tokyo Night' })).toBe('Tokyo Night')
  })

  test('qualifies the family when the variant is a distinct palette', () => {
    expect(themeDisplayName({ label: 'Moon', familyLabel: 'Rosé Pine' })).toBe('Rosé Pine Moon')
    expect(themeDisplayName({ label: 'Mirage', familyLabel: 'Ayu' })).toBe('Ayu Mirage')
    expect(themeDisplayName({ label: 'Wave', familyLabel: 'Kanagawa' })).toBe('Kanagawa Wave')
  })
})

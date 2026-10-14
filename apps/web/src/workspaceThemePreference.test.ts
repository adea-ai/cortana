import { afterEach, expect, test } from 'bun:test'
import { DEFAULT_THEME } from './theme'
import {
  clearWorkspaceThemePreference,
  moveWorkspaceThemePreference,
  readDeviceThemePreference,
  readWorkspaceThemePreference,
  resolveWorkspaceTheme,
  WORKSPACE_THEME_EVENT,
  writeDeviceThemePreference,
  writeWorkspaceThemePreference,
} from './workspaceThemePreference'

const WORKSPACE_THEME_KEY = 'cortana.workspace-themes.v1'
const DEVICE_THEME_KEY = 'cortana.device-theme.v1'

afterEach(() => {
  window.localStorage.removeItem(WORKSPACE_THEME_KEY)
  window.localStorage.removeItem(DEVICE_THEME_KEY)
})

test('resolves the workspace override, then the device default, then the product default', () => {
  expect(resolveWorkspaceTheme('work')).toBe(DEFAULT_THEME)
  writeDeviceThemePreference('nord')
  expect(resolveWorkspaceTheme('work')).toBe('nord')
  writeWorkspaceThemePreference('work', 'dracula')
  expect(resolveWorkspaceTheme('work')).toBe('dracula')
  expect(resolveWorkspaceTheme('personal')).toBe('nord')
})

test('clearing an override returns the workspace to the device default', () => {
  writeDeviceThemePreference('nord')
  writeWorkspaceThemePreference('work', 'dracula')
  writeWorkspaceThemePreference('personal', 'rosepine-moon')
  clearWorkspaceThemePreference('work')
  expect(readWorkspaceThemePreference('work')).toBeNull()
  expect(resolveWorkspaceTheme('work')).toBe('nord')
  expect(JSON.parse(window.localStorage.getItem(WORKSPACE_THEME_KEY) ?? '{}')).toEqual({
    personal: 'rosepine-moon',
  })
  // Clearing a workspace without an override leaves the stored map as it was.
  const before = window.localStorage.getItem(WORKSPACE_THEME_KEY)
  clearWorkspaceThemePreference('missing')
  expect(window.localStorage.getItem(WORKSPACE_THEME_KEY)).toBe(before)
})

test('the device default never touches the per-workspace map', () => {
  const legacy = JSON.stringify({ work: 'blue', personal: 'plum' })
  window.localStorage.setItem(WORKSPACE_THEME_KEY, legacy)
  // A default that differs from every legacy mapping, so a legacy override that
  // fell through to it would be visible.
  writeDeviceThemePreference('tokyonight-night')
  expect(window.localStorage.getItem(WORKSPACE_THEME_KEY)).toBe(legacy)
  expect(window.localStorage.getItem(DEVICE_THEME_KEY)).toBe('tokyonight-night')
  // Saved overrides keep resolving through the legacy map, ahead of the default.
  expect(resolveWorkspaceTheme('work')).toBe('nord')
  expect(resolveWorkspaceTheme('personal')).toBe('dracula')
  expect(resolveWorkspaceTheme('other')).toBe('tokyonight-night')
})

test('setting and clearing an override keeps other legacy entries as stored', () => {
  window.localStorage.setItem(WORKSPACE_THEME_KEY, JSON.stringify({ personal: 'forest' }))
  writeWorkspaceThemePreference('work', 'dracula')
  // Entries the user did not touch are not normalized to catalogue ids.
  expect(JSON.parse(window.localStorage.getItem(WORKSPACE_THEME_KEY) ?? '{}')).toEqual({
    personal: 'forest',
    work: 'dracula',
  })
  clearWorkspaceThemePreference('work')
  expect(window.localStorage.getItem(WORKSPACE_THEME_KEY)).toBe(
    JSON.stringify({ personal: 'forest' })
  )
  expect(resolveWorkspaceTheme('personal')).toBe('everforest-dark')
})

test('moving a workspace keeps its override and ignores the device default', () => {
  writeDeviceThemePreference('nord')
  writeWorkspaceThemePreference('work', 'dracula')
  moveWorkspaceThemePreference('work', 'work-2')
  expect(readWorkspaceThemePreference('work')).toBeNull()
  expect(resolveWorkspaceTheme('work-2')).toBe('dracula')
  expect(readDeviceThemePreference()).toBe('nord')
})

test('an invalid stored device default falls back instead of throwing', () => {
  expect(readDeviceThemePreference()).toBeNull()
  window.localStorage.setItem(DEVICE_THEME_KEY, 'not-a-theme')
  expect(readDeviceThemePreference()).toBe(DEFAULT_THEME)
  expect(resolveWorkspaceTheme('work')).toBe(DEFAULT_THEME)
  window.localStorage.setItem(DEVICE_THEME_KEY, 'x'.repeat(129))
  expect(readDeviceThemePreference()).toBeNull()
  window.localStorage.setItem(DEVICE_THEME_KEY, '')
  expect(readDeviceThemePreference()).toBeNull()
  // A pre-catalogue id resolves through the legacy map.
  window.localStorage.setItem(DEVICE_THEME_KEY, 'forest')
  expect(readDeviceThemePreference()).toBe('everforest-dark')
})

test('device default changes notify theme listeners', () => {
  let notified = 0
  const listener = () => (notified += 1)
  window.addEventListener(WORKSPACE_THEME_EVENT, listener)
  try {
    writeDeviceThemePreference('nord')
    writeWorkspaceThemePreference('work', 'dracula')
    clearWorkspaceThemePreference('work')
  } finally {
    window.removeEventListener(WORKSPACE_THEME_EVENT, listener)
  }
  expect(notified).toBe(3)
})

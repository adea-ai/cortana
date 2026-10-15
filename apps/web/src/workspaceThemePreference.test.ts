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
  // Successful writes end any session-local fallback a test left behind.
  writeDeviceThemePreference(DEFAULT_THEME)
  writeWorkspaceThemePreference('reset', DEFAULT_THEME)
  clearWorkspaceThemePreference('reset')
  window.localStorage.removeItem(WORKSPACE_THEME_KEY)
  window.localStorage.removeItem(DEVICE_THEME_KEY)
})

const quotaError = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError')
const securityError = () => new DOMException('The operation is insecure.', 'SecurityError')

// happy-dom's Storage ignores prototype patches once it holds items, so swap the whole object:
// the stand-in delegates to the real storage except for the method that throws. Calling the
// returned function puts the real storage back.
function failStorage(method: 'setItem' | 'getItem', error: () => Error) {
  const real = window.localStorage
  const stand: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
    getItem: (key) => real.getItem(key),
    setItem: (key, value) => real.setItem(key, value),
    removeItem: (key) => real.removeItem(key),
  }
  stand[method] = () => {
    throw error()
  }
  Object.defineProperty(window, 'localStorage', { value: stand, configurable: true })
  return () => {
    Object.defineProperty(window, 'localStorage', { value: real, configurable: true })
  }
}

const failStorageWrites = (error: () => Error) => failStorage('setItem', error)
const failStorageReads = (error: () => Error) => failStorage('getItem', error)

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

for (const [kind, error] of [
  ['quota', quotaError],
  ['security', securityError],
] as const) {
  test(`a ${kind} error on the device default write keeps the default session-local`, () => {
    window.localStorage.setItem(WORKSPACE_THEME_KEY, JSON.stringify({ personal: 'dracula' }))
    writeDeviceThemePreference('nord')
    const notified: string[] = []
    const listener = () => notified.push(resolveWorkspaceTheme('work'))
    window.addEventListener(WORKSPACE_THEME_EVENT, listener)
    const restoreWrites = failStorageWrites(error)
    try {
      writeDeviceThemePreference('tokyonight-night')
      // The change event fires after the write failed, and re-resolving sees the new default.
      expect(notified).toEqual(['tokyonight-night'])
      // The selector's source and the shell's resolution agree: a workspace with no
      // override follows the new default, and one with an override keeps it.
      expect(readDeviceThemePreference()).toBe('tokyonight-night')
      expect(resolveWorkspaceTheme('work')).toBe('tokyonight-night')
      expect(resolveWorkspaceTheme('personal')).toBe('dracula')
    } finally {
      restoreWrites()
      window.removeEventListener(WORKSPACE_THEME_EVENT, listener)
    }
    // Nothing reached storage, and the override map was not rewritten.
    expect(window.localStorage.getItem(DEVICE_THEME_KEY)).toBe('nord')
    expect(window.localStorage.getItem(WORKSPACE_THEME_KEY)).toBe(
      JSON.stringify({ personal: 'dracula' })
    )
    // The session value outlives the failure until a write succeeds.
    expect(resolveWorkspaceTheme('work')).toBe('tokyonight-night')
  })

  test(`a ${kind} error on an override write keeps the override session-local`, () => {
    writeDeviceThemePreference('nord')
    writeWorkspaceThemePreference('personal', 'rosepine-moon')
    const notified: string[] = []
    const listener = () => notified.push(resolveWorkspaceTheme('work'))
    window.addEventListener(WORKSPACE_THEME_EVENT, listener)
    const restoreWrites = failStorageWrites(error)
    try {
      writeWorkspaceThemePreference('work', 'dracula')
      expect(notified).toEqual(['dracula'])
      expect(readWorkspaceThemePreference('work')).toBe('dracula')
      expect(resolveWorkspaceTheme('work')).toBe('dracula')
      // The other entry is kept, and clearing falls back to the device default.
      expect(resolveWorkspaceTheme('personal')).toBe('rosepine-moon')
      clearWorkspaceThemePreference('work')
      expect(readWorkspaceThemePreference('work')).toBeNull()
      expect(resolveWorkspaceTheme('work')).toBe('nord')
      expect(notified).toEqual(['dracula', 'nord'])
      moveWorkspaceThemePreference('personal', 'personal-2')
      expect(resolveWorkspaceTheme('personal-2')).toBe('rosepine-moon')
      expect(readWorkspaceThemePreference('personal')).toBeNull()
    } finally {
      restoreWrites()
      window.removeEventListener(WORKSPACE_THEME_EVENT, listener)
    }
    expect(JSON.parse(window.localStorage.getItem(WORKSPACE_THEME_KEY) ?? '{}')).toEqual({
      personal: 'rosepine-moon',
    })
  })
}

test('a later successful write ends the session-local divergence', () => {
  writeDeviceThemePreference('nord')
  writeWorkspaceThemePreference('personal', 'dracula')
  const restoreWrites = failStorageWrites(quotaError)
  try {
    writeDeviceThemePreference('tokyonight-night')
    writeWorkspaceThemePreference('work', 'rosepine-moon')
  } finally {
    restoreWrites()
  }
  expect(resolveWorkspaceTheme('other')).toBe('tokyonight-night')
  expect(resolveWorkspaceTheme('work')).toBe('rosepine-moon')
  // Storage works again: the next write persists, and storage is the source of truth.
  writeDeviceThemePreference('nord')
  writeWorkspaceThemePreference('work', 'dracula')
  expect(window.localStorage.getItem(DEVICE_THEME_KEY)).toBe('nord')
  // The override written while storage failed was part of the session copy, so it persists too.
  expect(JSON.parse(window.localStorage.getItem(WORKSPACE_THEME_KEY) ?? '{}')).toEqual({
    personal: 'dracula',
    work: 'dracula',
  })
  window.localStorage.setItem(DEVICE_THEME_KEY, 'everforest-dark')
  expect(resolveWorkspaceTheme('other')).toBe('everforest-dark')
})

test('a storage read that throws falls back to what this session wrote', () => {
  writeDeviceThemePreference('nord')
  writeWorkspaceThemePreference('work', 'dracula')
  const restoreReads = failStorageReads(securityError)
  try {
    expect(readDeviceThemePreference()).toBe('nord')
    expect(resolveWorkspaceTheme('work')).toBe('dracula')
    expect(resolveWorkspaceTheme('other')).toBe('nord')
  } finally {
    restoreReads()
  }
})

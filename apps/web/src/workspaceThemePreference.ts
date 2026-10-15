import { DEFAULT_THEME, normalizeThemeId, type ThemeMode } from './theme'

const WORKSPACE_THEME_KEY = 'cortana.workspace-themes.v1'
const DEVICE_THEME_KEY = 'cortana.device-theme.v1'
export const WORKSPACE_THEME_EVENT = 'cortana:workspace-theme-changed'

type WorkspaceThemeMap = Record<string, ThemeMode>

/**
 * What this page last wrote, kept beside storage. `persisted` says whether storage
 * accepted that write. While it did not (quota, security error, storage disabled),
 * the copy is the answer for every read, so the Settings selectors, the shell's
 * resolution and the change event all see the same value for the rest of the session.
 * Once a write persists, storage is the source of truth again and the copy is only
 * the answer when storage cannot be read at all. Nothing here outlives a reload.
 */
type SessionCopy<T> = { value: T; persisted: boolean }

let workspaceMapSession: SessionCopy<Record<string, string>> | null = null
let deviceThemeSession: SessionCopy<ThemeMode> | null = null

function notifyThemeChange(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(WORKSPACE_THEME_EVENT))
}

function readMap(): Record<string, string> {
  if (workspaceMapSession && !workspaceMapSession.persisted) return { ...workspaceMapSession.value }
  let raw: string | null
  try {
    raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(WORKSPACE_THEME_KEY)
  } catch {
    return workspaceMapSession ? { ...workspaceMapSession.value } : {}
  }
  try {
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([workspaceId, theme]) =>
          workspaceId.length > 0 && workspaceId.length <= 128 && typeof theme === 'string'
      )
    ) as Record<string, string>
  } catch {
    return {}
  }
}

function writeMap(map: Record<string, string>): void {
  const session: SessionCopy<Record<string, string>> = { value: { ...map }, persisted: false }
  workspaceMapSession = session
  try {
    localStorage.setItem(WORKSPACE_THEME_KEY, JSON.stringify(map))
    session.persisted = true
  } catch {
    // Workspace theme preferences remain session-local when storage is unavailable:
    // the session copy answers reads until a later write persists.
  }
  notifyThemeChange()
}

/** Stored ids resolve through the legacy map, so pre-catalogue values keep working. */
export function readWorkspaceThemePreferences(): WorkspaceThemeMap {
  return Object.fromEntries(
    Object.entries(readMap()).map(([workspaceId, theme]) => [workspaceId, normalizeThemeId(theme)])
  )
}

/**
 * Own-property lookup: a workspace id such as `constructor` must not find an
 * inherited member of the stored map and so skip the device default.
 */
function ownOverride(map: Record<string, string>, workspaceId: string): string | undefined {
  return Object.hasOwn(map, workspaceId) ? map[workspaceId] : undefined
}

export function readWorkspaceThemePreference(workspaceId: string): ThemeMode | null {
  if (!workspaceId) return null
  const stored = ownOverride(readMap(), workspaceId)
  return stored === undefined ? null : normalizeThemeId(stored)
}

export function writeWorkspaceThemePreference(workspaceId: string, theme: ThemeMode): void {
  if (!workspaceId || workspaceId.length > 128) return
  writeMap({ ...readMap(), [workspaceId]: theme })
}

/** Removing the override sends the workspace back to the device default. */
export function clearWorkspaceThemePreference(workspaceId: string): void {
  const map = readMap()
  if (!Object.hasOwn(map, workspaceId)) return
  delete map[workspaceId]
  writeMap(map)
}

/**
 * The device default lives under its own key, so the per-workspace map above is
 * never rewritten when it changes. It shares the change event: every consumer
 * that already re-resolves the shell theme on a workspace change does the same
 * for the default.
 */
export function readDeviceThemePreference(): ThemeMode | null {
  if (deviceThemeSession && !deviceThemeSession.persisted) return deviceThemeSession.value
  try {
    const stored =
      typeof localStorage === 'undefined' ? null : localStorage.getItem(DEVICE_THEME_KEY)
    return stored && stored.length <= 128 ? normalizeThemeId(stored) : null
  } catch {
    return deviceThemeSession?.value ?? null
  }
}

/**
 * When storage rejects the write the default still applies, for this session only:
 * the change event fires either way, so the shell re-resolves and every consumer
 * reads the same value, and the next successful write (or a reload) ends it.
 */
export function writeDeviceThemePreference(theme: ThemeMode): void {
  const session: SessionCopy<ThemeMode> = { value: theme, persisted: false }
  deviceThemeSession = session
  try {
    localStorage.setItem(DEVICE_THEME_KEY, theme)
    session.persisted = true
  } catch {
    // Quota, security error or storage disabled: the session copy answers reads.
  }
  notifyThemeChange()
}

/** Workspace override, then the device default, then the product default. */
export function resolveWorkspaceTheme(workspaceId: string): ThemeMode {
  return readWorkspaceThemePreference(workspaceId) ?? readDeviceThemePreference() ?? DEFAULT_THEME
}

export function moveWorkspaceThemePreference(fromId: string, toId: string): void {
  if (!fromId || !toId || fromId === toId) return
  const map = readMap()
  const theme = ownOverride(map, fromId)
  if (!theme) return
  delete map[fromId]
  map[toId] = theme
  writeMap(map)
}

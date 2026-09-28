import { normalizeThemeId, type ThemeMode } from './theme'

const WORKSPACE_THEME_KEY = 'cortana.workspace-themes.v1'
export const WORKSPACE_THEME_EVENT = 'cortana:workspace-theme-changed'

type WorkspaceThemeMap = Record<string, ThemeMode>

function readMap(): Record<string, string> {
  try {
    const raw =
      typeof localStorage === 'undefined' ? null : localStorage.getItem(WORKSPACE_THEME_KEY)
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
  try {
    localStorage.setItem(WORKSPACE_THEME_KEY, JSON.stringify(map))
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(WORKSPACE_THEME_EVENT))
  } catch {
    // Workspace theme preferences remain session-local when storage is unavailable.
  }
}

/** Stored ids resolve through the legacy map, so pre-catalogue values keep working. */
export function readWorkspaceThemePreferences(): WorkspaceThemeMap {
  return Object.fromEntries(
    Object.entries(readMap()).map(([workspaceId, theme]) => [workspaceId, normalizeThemeId(theme)])
  )
}

export function readWorkspaceThemePreference(workspaceId: string): ThemeMode | null {
  if (!workspaceId) return null
  const stored = readMap()[workspaceId]
  return stored === undefined ? null : normalizeThemeId(stored)
}

export function writeWorkspaceThemePreference(workspaceId: string, theme: ThemeMode): void {
  if (!workspaceId || workspaceId.length > 128) return
  writeMap({ ...readMap(), [workspaceId]: theme })
}

export function moveWorkspaceThemePreference(fromId: string, toId: string): void {
  if (!fromId || !toId || fromId === toId) return
  const map = readMap()
  const theme = map[fromId]
  if (!theme) return
  delete map[fromId]
  map[toId] = theme
  writeMap(map)
}

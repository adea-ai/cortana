import { catalogueThemeAppearance } from '@adea-ai/ui/lib/theme-defaults'
import type { ThemeVariant } from '@adea-ai/ui/lib/themes'

/**
 * Workspace themes are ids from the shared @adea-ai/themes catalogue, applied by
 * the shared ThemeProvider. Cortana is dark-chrome only, so the picker offers the
 * catalogue's dark variants; the light variants stay reachable through the same
 * provider if the product ever grows an appearance axis.
 */
export type ThemeMode = string

export const DEFAULT_THEME = 'adea-dark'

/**
 * Where the shared ThemeProvider keeps the selection. The build writes a boot
 * script that reads the same key (vite.config.ts), so the two cannot disagree.
 */
export const APPEARANCE_STORAGE_KEY = 'cortana.appearance'

/**
 * Preferences stored before the shared catalogue landed. Each legacy id maps to
 * the catalogue theme that replaces it, so an existing `cortana.workspace-themes
 * .v1` value keeps resolving instead of silently resetting everyone to the
 * default. Mappings were chosen by nearest hue/character; users can re-pick.
 */
export const LEGACY_THEME_MAP: Readonly<Record<string, ThemeMode>> = {
  blue: 'nord',
  accessible: 'adea-dark-high-contrast',
  forest: 'everforest-dark',
  plum: 'dracula',
  sand: 'solarized-dark',
  graphite: 'adea-dark',
  teal: 'catppuccin-macchiato',
  rose: 'rosepine-moon',
  slate: 'aardvark-ink',
  indigo: 'tokyonight-night',
  emerald: 'kanagawa',
  amber: 'gruvbox-dark',
}

/**
 * Whether the catalogue holds a dark theme under this id. Answered from the id
 * index, so the 34-theme catalogue stays out of the startup chunk; the provider
 * loads it when a stored theme needs it.
 */
export function isDarkThemeId(value: string): boolean {
  return catalogueThemeAppearance(value) === 'dark'
}

/** Resolve a stored preference to a catalogue id: identity, legacy map, or default. */
export function normalizeThemeId(value: string | null | undefined): ThemeMode {
  if (!value) return DEFAULT_THEME
  if (isDarkThemeId(value)) return value
  return LEGACY_THEME_MAP[value] ?? DEFAULT_THEME
}

/**
 * The catalogue labels themes within a family ("Everforest" → "Dark"), so a flat
 * picker list needs the family for context: "Everforest", "Adea Dark", "Ayu
 * Mirage". Where the family label already says it all ("Nord", "Tokyo Night",
 * "One Dark"), it is used alone.
 */
export function themeDisplayName(theme: Pick<ThemeVariant, 'label' | 'familyLabel'>): string {
  if (
    theme.label === 'Dark' ||
    theme.label === 'Light' ||
    theme.familyLabel.includes(theme.label)
  ) {
    return theme.familyLabel
  }
  return `${theme.familyLabel} ${theme.label}`
}

import { themesForAppearance, type ThemeVariant } from '@adea-ai/ui/lib/themes'

/**
 * Workspace themes are ids from the shared @adea-ai/themes catalogue, applied by
 * the shared ThemeProvider. Cortana is dark-chrome only, so the picker offers the
 * catalogue's dark variants; the light variants stay reachable through the same
 * provider if the product ever grows an appearance axis.
 */
export type ThemeMode = string

export const DEFAULT_THEME = 'adea-dark'

const DARK_THEME_IDS: ReadonlySet<string> = new Set(
  themesForAppearance('dark').map((theme) => theme.id)
)

/**
 * Preferences stored before the shared catalogue landed. Each legacy id maps to
 * the catalogue theme that replaces it, so an existing `cortana.workspace-themes
 * .v1` value keeps resolving instead of silently resetting everyone to the
 * default. Mappings were chosen by nearest hue/character; users can re-pick.
 */
export const LEGACY_THEME_MAP: Readonly<Record<string, ThemeMode>> = {
  blue: 'nord',
  accessible: 'contrast-dark',
  forest: 'everforest-dark',
  plum: 'dracula',
  sand: 'solarized-dark',
  graphite: 'adea-dark',
  teal: 'catppuccin-macchiato',
  rose: 'rosepine-moon',
  slate: 'slate-dark',
  indigo: 'tokyonight-night',
  emerald: 'kanagawa',
  amber: 'gruvbox-dark',
}

export function isDarkThemeId(value: string): boolean {
  return DARK_THEME_IDS.has(value)
}

/** Resolve a stored preference to a catalogue id: identity, legacy map, or default. */
export function normalizeThemeId(value: string | null | undefined): ThemeMode {
  if (!value) return DEFAULT_THEME
  if (DARK_THEME_IDS.has(value)) return value
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

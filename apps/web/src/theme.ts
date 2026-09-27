import { shadcnVariables } from '@adea-ai/themes/adapters/shadcn'
import { themeCssVariables } from '@adea-ai/themes/adapters/css'
import type { AdeaTheme } from '@adea-ai/themes'
import paperTheme from '@adea-ai/themes/themes/adea-light'
import defaultTheme from '@adea-ai/themes/themes/one-dark'

export type ThemeMode =
  | 'blue'
  | 'accessible'
  | 'forest'
  | 'plum'
  | 'sand'
  | 'graphite'
  | 'teal'
  | 'rose'
  | 'slate'
  | 'indigo'
  | 'emerald'
  | 'amber'

export const DEFAULT_THEME: ThemeMode = 'graphite'

/** Persisted Cortana ids stay stable while their palette data comes from themes. */
export const LEGACY_THEME_TO_CANONICAL_ID = {
  blue: 'tokyonight-storm',
  accessible: 'adea-dark',
  forest: 'everforest-dark',
  plum: 'rosepine-moon',
  sand: 'gruvbox-dark',
  graphite: 'one-dark',
  teal: 'ayu-mirage',
  rose: 'rosepine',
  slate: 'nord',
  indigo: 'tokyonight-night',
  emerald: 'catppuccin-mocha',
  amber: 'kanagawa',
} as const satisfies Record<ThemeMode, string>

export const SUPPORTED_THEMES: ReadonlyArray<{ id: ThemeMode; label: string }> = [
  { id: 'blue', label: 'Tokyo Night Storm' },
  { id: 'accessible', label: 'Adea Dark' },
  { id: 'forest', label: 'Everforest Dark' },
  { id: 'plum', label: 'Rosé Pine Moon' },
  { id: 'sand', label: 'Gruvbox Dark' },
  { id: 'graphite', label: 'One Dark' },
  { id: 'teal', label: 'Ayu Mirage' },
  { id: 'rose', label: 'Rosé Pine' },
  { id: 'slate', label: 'Nord' },
  { id: 'indigo', label: 'Tokyo Night' },
  { id: 'emerald', label: 'Catppuccin Mocha' },
  { id: 'amber', label: 'Kanagawa' },
]

const themeLoaders = {
  blue: () => import('@adea-ai/themes/themes/tokyonight-storm'),
  accessible: () => import('@adea-ai/themes/themes/adea-dark'),
  forest: () => import('@adea-ai/themes/themes/everforest-dark'),
  plum: () => import('@adea-ai/themes/themes/rosepine-moon'),
  sand: () => import('@adea-ai/themes/themes/gruvbox-dark'),
  graphite: async () => ({ default: defaultTheme }),
  teal: () => import('@adea-ai/themes/themes/ayu-mirage'),
  rose: () => import('@adea-ai/themes/themes/rosepine'),
  slate: () => import('@adea-ai/themes/themes/nord'),
  indigo: () => import('@adea-ai/themes/themes/tokyonight-night'),
  emerald: () => import('@adea-ai/themes/themes/catppuccin-mocha'),
  amber: () => import('@adea-ai/themes/themes/kanagawa'),
} satisfies Record<ThemeMode, () => Promise<{ default: AdeaTheme }>>

const supportedThemeIds = new Set(SUPPORTED_THEMES.map(({ id }) => id))
let latestThemeRequest = 0

export function isThemeMode(value: string | null): value is ThemeMode {
  return value !== null && supportedThemeIds.has(value as ThemeMode)
}

export function resolveThemeMode(value: string | null | undefined): ThemeMode {
  const candidate = value ?? null
  return isThemeMode(candidate) ? candidate : DEFAULT_THEME
}

/**
 * Apply a published palette while retaining the stable workspace preference id.
 * The light paper surface stays available for Cortana's document preview in dark
 * workspace themes; both palettes still come from the shared catalogue.
 */
export function applyTheme(value: ThemeMode): void | Promise<void> {
  if (typeof document === 'undefined') return

  const mode = resolveThemeMode(value)
  const request = ++latestThemeRequest
  if (mode === DEFAULT_THEME) {
    applyPalette(mode, defaultTheme, request)
    return
  }

  return themeLoaders[mode]().then(
    ({ default: theme }) => applyPalette(mode, theme, request),
    () => applyPalette(DEFAULT_THEME, defaultTheme, request)
  )
}

function applyPalette(mode: ThemeMode, theme: AdeaTheme, request: number): void {
  if (request !== latestThemeRequest) return
  if (theme.id !== LEGACY_THEME_TO_CANONICAL_ID[mode]) {
    throw new Error(`Cortana theme ${mode} resolved to unexpected palette ${theme.id}.`)
  }

  const root = document.documentElement
  const variables = {
    ...themeCssVariables(theme),
    ...shadcnVariables(theme),
    ...themeCssVariables(paperTheme, { prefix: 'cortana-paper' }),
  }

  for (const [name, color] of Object.entries(variables)) root.style.setProperty(name, color)
  for (let index = 1; index <= 6; index += 1) {
    const value = variables[`--adea-chart-${index}`]
    if (value) root.style.setProperty(`--chart-${index}`, value)
  }

  root.dataset['theme'] = mode
  root.dataset['appearance'] = theme.appearance
  root.classList.toggle('dark', theme.appearance === 'dark')
  root.style.colorScheme = theme.appearance
}

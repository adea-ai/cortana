import type { DesktopSettings, ProviderModelEntry, ProviderModelKind } from '../../types'

export type ProviderValue = DesktopSettings['embedding'] | DesktopSettings['query']
export type ModelChoice = {
  value: string
  label: string
}

/** Provider-advertised catalog captured for one provider kind. */
export type ProviderModelsState = {
  kind: ProviderModelKind
  /** Normalized base URL the catalog was fetched from. */
  provider: string
  mode: 'local' | 'cloud'
  key_env: string | null
  models: ProviderModelEntry[]
  truncated: boolean
}

export function normalizeProviderUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

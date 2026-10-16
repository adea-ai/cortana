import type { SourceSettings } from '../../types'

export { useDesktopForeground } from '../../lib/foreground'

export function applyConfirmed(decision: boolean | Promise<boolean>, action: () => void): void {
  if (typeof decision === 'boolean') {
    if (decision) action()
    return
  }
  void decision.then((confirmed) => confirmed && action())
}

/** Words the readiness scan abbreviates in lower case that read as acronyms in a label. */
const READINESS_ACRONYMS = new Set(['acl', 'api'])

/**
 * Turns a readiness check id such as `api-health` into the label shown on its
 * card: sentence case with acronyms upper-cased ("API health").
 */
export function readinessCheckLabel(name: string): string {
  const words = name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => (READINESS_ACRONYMS.has(word.toLowerCase()) ? word.toUpperCase() : word))
  const label = words.join(' ')
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** Labels of the readiness checks that did not pass, in scan order. */
export function failedReadinessCheckLabels(
  checks: ReadonlyArray<{ name: string; passed: boolean }>
): string[] {
  return checks.filter((check) => !check.passed).map((check) => readinessCheckLabel(check.name))
}

/**
 * Chip state for a finished source or installer job. A cancelled job is a
 * deliberate stop, not a failure, so it reads "Cancelled" in the neutral tone.
 */
export function jobGlyphState(status: string): {
  passed: boolean
  cancelled: boolean
  pending: boolean
} {
  return {
    passed: status === 'succeeded',
    cancelled: status === 'cancelled',
    pending: status === 'running' || status === 'cancelling',
  }
}

/** The muted line under a source card's title; external commands live in the TOML file, not a path. */
export function sourceSubtitle(source: SourceSettings): string {
  if (source.kind === 'external') return 'Command managed in the TOML file'
  if (source.kind === 'filesystem' || source.kind === 'buzz') {
    return source.root || 'Choose a file or folder'
  }
  if (source.kind === 'github') {
    return source.repositories.length
      ? source.repositories.slice(0, 2).join(', ')
      : source.token_path || source.token_env || 'GitHub account not connected'
  }
  if (source.kind === 'slack') {
    return source.team_names.join(', ') || source.token_path || 'Slack account not connected'
  }
  if (
    source.kind === 'google-drive' ||
    source.kind === 'gmail' ||
    source.kind === 'google-calendar'
  ) {
    return source.token_path || 'Google account not connected'
  }
  if (source.kind === 'discord') {
    return source.servers.length
      ? `${source.servers.length} server${source.servers.length === 1 ? '' : 's'} selected`
      : source.token_path || 'Discord account not connected'
  }
  if (source.kind === 'apple-notes') {
    return source.folders?.length ? source.folders.join(', ') : 'All Apple Notes folders'
  }
  return source.name || 'Not connected'
}

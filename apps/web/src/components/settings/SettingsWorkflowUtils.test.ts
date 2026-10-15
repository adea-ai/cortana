import { expect, test } from 'bun:test'
import type { SourceSettings } from '../../types'
import {
  failedReadinessCheckLabels,
  jobGlyphState,
  readinessCheckLabel,
  sourceSubtitle,
} from './SettingsWorkflowUtils'

const source = (overrides: Partial<SourceSettings>): SourceSettings => ({
  name: 'work-code',
  kind: 'filesystem',
  enabled: true,
  project: 'work',
  root: null,
  source: null,
  channels: [],
  repositories: [],
  servers: [],
  teams: [],
  team_names: [],
  communities: [],
  community_names: [],
  token_env: null,
  token_path: null,
  oauth_client_path: null,
  query: null,
  labels: [],
  max_content_chars: null,
  max_documents: null,
  max_bytes: null,
  max_duration_seconds: null,
  exclude: [],
  acl: [],
  editable: true,
  ...overrides,
})

test('readiness check ids read as sentence-case labels with acronyms kept', () => {
  expect(readinessCheckLabel('api-health')).toBe('API health')
  expect(readinessCheckLabel('embedding-health')).toBe('Embedding health')
  expect(readinessCheckLabel('query-api')).toBe('Query API')
  expect(readinessCheckLabel('shared-access-acl')).toBe('Shared access ACL')
  expect(readinessCheckLabel('sync')).toBe('Sync')
  expect(readinessCheckLabel('')).toBe('')
})

test('failed readiness checks are listed by label in scan order', () => {
  expect(
    failedReadinessCheckLabels([
      { name: 'api-health', passed: false },
      { name: 'embedding-health', passed: true },
      { name: 'backup-freshness', passed: false },
    ])
  ).toEqual(['API health', 'Backup freshness'])
  expect(failedReadinessCheckLabels([{ name: 'api-health', passed: true }])).toEqual([])
  expect(failedReadinessCheckLabels([])).toEqual([])
})

test('a cancelled job is neutral, not failed', () => {
  expect(jobGlyphState('succeeded')).toEqual({
    passed: true,
    optional: false,
    pending: false,
  })
  expect(jobGlyphState('failed')).toEqual({
    passed: false,
    optional: false,
    pending: false,
  })
  expect(jobGlyphState('cancelled')).toEqual({
    passed: false,
    optional: true,
    pending: false,
  })
  expect(jobGlyphState('running')).toEqual({
    passed: false,
    optional: false,
    pending: true,
  })
  expect(jobGlyphState('cancelling')).toEqual({
    passed: false,
    optional: false,
    pending: true,
  })
})

test('source subtitles describe what each connector points at', () => {
  expect(sourceSubtitle(source({ root: '/example/workspace' }))).toBe('/example/workspace')
  expect(sourceSubtitle(source({ root: null }))).toBe('Choose a file or folder')
  expect(sourceSubtitle(source({ kind: 'external', root: null }))).toBe(
    'Command managed in the TOML file'
  )
  expect(sourceSubtitle(source({ kind: 'external', root: '/example/ignored' }))).toBe(
    'Command managed in the TOML file'
  )
  expect(sourceSubtitle(source({ kind: 'discord', servers: ['1'] }))).toBe('1 server selected')
  expect(sourceSubtitle(source({ kind: 'discord', servers: ['1', '2'] }))).toBe(
    '2 servers selected'
  )
  expect(sourceSubtitle(source({ kind: 'discord' }))).toBe('Discord account not connected')
  expect(sourceSubtitle(source({ kind: 'apple-notes' }))).toBe('All Apple Notes folders')
})

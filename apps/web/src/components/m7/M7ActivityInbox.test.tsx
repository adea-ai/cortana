import { afterEach, expect, test } from 'bun:test'
import { cleanup, render, screen } from 'solid-testing-library'

import type { BrainStatus, SourceSyncSummary } from '../../types'
import { StatusGlyph } from '../settings/SettingsWorkflowShared'
import { M7ActivityInbox } from './M7ActivityInbox'

afterEach(cleanup)

const run = (status: SourceSyncSummary['status'], source: string): SourceSyncSummary => ({
  source,
  project: 'work',
  status,
  started_at: '2026-10-23T00:00:00Z',
  completed_at: '2026-10-23T00:01:00Z',
  documents: 1,
  bytes: 10,
  deleted: 0,
  budget_documents: 0,
  budget_bytes: 0,
  budget_seconds: 0,
})

const chipOf = (element: HTMLElement) => element.closest<HTMLElement>('[data-slot="status-chip"]')

const classesOf = (element: HTMLElement | null) => {
  if (!element) throw new Error('status chip not found')
  return [element, ...element.querySelectorAll('*')].map((node) => node.className).join('|')
}

test('a cancelled sync run reads Cancelled in the neutral tone that Settings uses, not the failed tone', () => {
  render(() => (
    <>
      <M7ActivityInbox
        status={
          {
            sync_runs: [run('cancelled', 'Cancelled source'), run('failed', 'Failed source')],
          } as unknown as BrainStatus
        }
        sourceJobs={[]}
        onOpenSettings={() => {}}
      />
      <StatusGlyph passed={false} optional />
    </>
  ))
  const cancelled = classesOf(chipOf(screen.getByText('Cancelled')))
  expect(cancelled).toBe(classesOf(screen.getByRole('img', { name: 'Optional' })))
  expect(cancelled).not.toBe(classesOf(chipOf(screen.getByText('Failed'))))
})

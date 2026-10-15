import { afterEach, expect, test } from 'bun:test'
import { cleanup, render, screen, within } from 'solid-testing-library'

import type { AuditEvent } from '../../types'
import { AuditList, auditOutcome } from './AuditSection'

afterEach(cleanup)

const events: AuditEvent[] = [
  { id: 1, event: 'memory.export', status: 'succeeded', at_unix_seconds: 1785000000 },
  { id: 2, event: 'brain_documents', status: 'failed', at_unix_seconds: 1785000060 },
  { id: 3, event: 'status', outcome: 'unauthorized', timestamp: '2026-10-14T09:08:00Z' },
  { id: 4, action: 'settings_saved' },
]

test('audit events render as a named list of cards with a heading and a text outcome', () => {
  render(() => <AuditList title="Runtime retrieval" detail="Nothing yet." events={events} />)

  expect(screen.getByRole('heading', { level: 3, name: 'Runtime retrieval' })).toBeTruthy()
  const items = within(screen.getByRole('list', { name: 'Runtime retrieval' })).getAllByRole(
    'listitem'
  )
  expect(items).toHaveLength(4)

  // The outcome is words, not only colour, so it survives without colour vision.
  expect(within(items[0]).getByText('memory.export')).toBeTruthy()
  expect(within(items[0]).getByText('Succeeded')).toBeTruthy()
  expect(within(items[1]).getByText('Failed')).toBeTruthy()
  expect(within(items[2]).getByText('Unauthorized')).toBeTruthy()
  // An event with no outcome says nothing rather than inventing one.
  expect(within(items[3]).getByText('settings_saved')).toBeTruthy()
  expect(items[3].querySelector('[data-slot="status-chip"]')).toBeNull()
})

test('each audit event keeps a labelled, scrollable JSON block', () => {
  render(() => <AuditList title="Desktop actions" detail="Nothing yet." events={events} />)

  const regions = screen.getAllByLabelText('Audit event details')
  expect(regions).toHaveLength(events.length)
  for (const region of regions) expect(region.textContent).toContain('"id"')
})

test('an empty audit list says so through the shared empty state', () => {
  render(() => (
    <AuditList title="Desktop actions" detail="Actions are recorded here." events={[]} />
  ))

  expect(screen.getByRole('heading', { level: 4, name: 'No events available.' })).toBeTruthy()
  expect(screen.getByText('Actions are recorded here.')).toBeTruthy()
  expect(screen.queryByRole('list')).toBeNull()
})

test('audit outcomes map to tones and always carry a label', () => {
  expect(auditOutcome({ success: true })).toEqual({ tone: 'success', label: 'Succeeded' })
  expect(auditOutcome({ success: false })).toEqual({ tone: 'danger', label: 'Failed' })
  expect(auditOutcome({ passed: true })).toEqual({ tone: 'success', label: 'Passed' })
  expect(auditOutcome({ passed: false })).toEqual({ tone: 'danger', label: 'Failed' })
  expect(auditOutcome({ status: 'ok' })).toEqual({ tone: 'success', label: 'Ok' })
  expect(auditOutcome({ result: 'budget_exceeded' })).toEqual({
    tone: 'danger',
    label: 'Budget exceeded',
  })
  expect(auditOutcome({ outcome: 'unauthorized' })).toEqual({
    tone: 'neutral',
    label: 'Unauthorized',
  })
  expect(auditOutcome({ action: 'query' })).toBeNull()
})

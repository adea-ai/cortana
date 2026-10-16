import { afterEach, expect, test } from 'bun:test'
import { cleanup, render, screen } from 'solid-testing-library'

import { StatusGlyph } from './SettingsWorkflowShared'

afterEach(cleanup)

const classesOf = (name: string) => {
  const chip = screen.getByRole('img', { name })
  return [chip.className, ...[...chip.querySelectorAll('*')].map((node) => node.className)].join(
    '|'
  )
}

test('a cancelled job reads Cancelled in the same neutral tone as an optional check, not the failed tone', () => {
  render(() => (
    <>
      <StatusGlyph passed={false} cancelled />
      <StatusGlyph passed={false} optional />
      <StatusGlyph passed={false} />
    </>
  ))
  expect(classesOf('Cancelled')).toBe(classesOf('Optional'))
  expect(classesOf('Cancelled')).not.toBe(classesOf('Failed'))
})

import { afterEach, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from 'solid-testing-library'
import { createSignal } from 'solid-js'

import type { DesktopSettings } from '../../types'
import { desktopSettings } from '../../test/fixtures'
import { NativeMemorySection } from './NativeMemorySection'

afterEach(cleanup)

function renderMemory() {
  const [settings, setSettings] = createSignal<DesktopSettings>(desktopSettings)
  render(() => (
    <NativeMemorySection settings={settings()} update={(change) => setSettings(change)} />
  ))
  return settings
}

test('memory limits take only values the field accepts instead of falling back to 1 or 0', async () => {
  const settings = renderMemory()
  const active = (await screen.findByLabelText('Maximum active memories')) as HTMLInputElement
  const before = settings().memory.max_active

  fireEvent.input(active, { target: { value: '0' } })
  expect(settings().memory.max_active).toBe(before)
  expect(
    await screen.findByText('Maximum active memories must be between 1 and 1000000.')
  ).toBeTruthy()
  fireEvent.blur(active)
  expect(active.value).toBe(String(before))

  fireEvent.input(active, { target: { value: '250' } })
  expect(settings().memory.max_active).toBe(250)
})

test('score defaults move on a 0.05 grid and reject values off it', async () => {
  const settings = renderMemory()
  const confidence = (await screen.findByLabelText('Default confidence')) as HTMLInputElement
  expect(confidence.step).toBe('0.05')
  const before = settings().memory.default_confidence

  fireEvent.input(confidence, { target: { value: '0.12' } })
  expect(settings().memory.default_confidence).toBe(before)
  expect(screen.getByText('Default confidence must be a multiple of 0.05.')).toBeTruthy()

  fireEvent.input(confidence, { target: { value: '0.15' } })
  expect(settings().memory.default_confidence).toBe(0.15)
})

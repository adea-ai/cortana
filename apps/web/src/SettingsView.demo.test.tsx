import { afterEach, expect, mock, test } from 'bun:test'
import { cleanup, fireEvent, render, screen, waitFor } from 'solid-testing-library'
import { createSignal } from 'solid-js'
import type { DesktopSettings } from './types'
import { desktopSettings } from './test/fixtures'
afterEach(cleanup)
const realApi = await import('./api')
let saveSettings: typeof realApi.saveDesktopSettings | null = null
afterEach(() => {
  saveSettings = null
})
mock.module('./api', () => ({
  ...realApi,
  isDesktopApp: false,
  saveDesktopSettings: (...args: Parameters<typeof realApi.saveDesktopSettings>) =>
    saveSettings ? saveSettings(...args) : realApi.saveDesktopSettings(...args),
}))
const { SettingsView } = await import('./components/SettingsView')
test('browser settings adopt a demo fixture that arrives after the view mounts', async () => {
  const [ds, setDs] = createSignal<DesktopSettings | undefined>(undefined)
  render(() => <SettingsView onSaved={() => undefined} desktopSettings={ds()} />)
  expect(
    screen.getByRole('heading', {
      name: 'Desktop settings',
    })
  ).toBeTruthy()
  setDs(desktopSettings)
  expect(
    await screen.findByRole('heading', {
      level: 1,
      name: 'Settings',
    })
  ).toBeTruthy()
  expect(
    screen.getByRole('button', {
      name: 'Services',
    })
  ).toBeTruthy()
  expect(
    screen
      .getByRole('button', {
        name: 'Readiness',
      })
      .getAttribute('aria-current')
  ).toBe('page')
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Sources',
    })
  )
  expect(
    screen
      .getByRole('button', {
        name: 'Sources',
      })
      .getAttribute('aria-current')
  ).toBe('page')
  expect(
    screen
      .getByRole('button', {
        name: 'Readiness',
      })
      .hasAttribute('aria-current')
  ).toBe(false)
})

test('shared settings save action announces and disables while saving', async () => {
  let finishSave: (() => void) | undefined
  saveSettings = (update) =>
    new Promise((resolve) => {
      finishSave = () => resolve({ ...desktopSettings, workspaces: update.workspaces })
    })

  render(() => (
    <SettingsView
      onSaved={() => undefined}
      initialSection="workspaces"
      desktopSettings={desktopSettings}
    />
  ))
  fireEvent.change((await screen.findAllByLabelText('Display name'))[0]!, {
    target: { value: 'Work renamed' },
  })

  const saveButton = screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement
  expect(saveButton.disabled).toBe(false)
  fireEvent.click(saveButton)

  const savingButton = await screen.findByRole('button', { name: 'Saving…' })
  expect((savingButton as HTMLButtonElement).disabled).toBe(true)
  expect(savingButton.getAttribute('aria-busy')).toBe('true')
  expect(savingButton.querySelector('svg[aria-hidden="true"]')).toBeTruthy()

  finishSave?.()
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement).disabled
    ).toBe(true)
  )
})

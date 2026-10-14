import { afterEach, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen, within } from 'solid-testing-library'
import { createSignal } from 'solid-js'

import type { DesktopSettings } from '../../types'
import { desktopSettings } from '../../test/fixtures'
import { AccessSection } from './AccessSection'
import { SettingsConfirmProvider } from './SettingsConfirm'

afterEach(cleanup)

function renderAccess() {
  const [settings, setSettings] = createSignal<DesktopSettings>({
    ...desktopSettings,
    auth_principals: [
      {
        principal: 'desktop-agent',
        token_env: 'CORTANA_DEMO_TOKEN',
        scopes: ['query'],
        acl: ['work'],
      },
      { principal: 'ops-agent', token_env: 'CORTANA_OPS_TOKEN', scopes: ['status'], acl: ['*'] },
    ],
  })
  render(() => (
    <SettingsConfirmProvider>
      <AccessSection
        settings={settings()}
        update={(change) => setSettings(change)}
        secretValues={{}}
        onSecret={() => undefined}
        clearedSecrets={new Set()}
        onClearSecret={() => undefined}
      />
    </SettingsConfirmProvider>
  ))
  return settings
}

test('each principal names its scope group and labels every scope checkbox', () => {
  renderAccess()

  for (const [principal, checked] of [
    ['desktop-agent', ['query']],
    ['ops-agent', ['status']],
  ] as const) {
    const group = screen.getByRole('group', { name: `Scopes for ${principal}` })
    expect(within(group).getAllByRole('checkbox')).toHaveLength(3)
    for (const scope of ['query', 'status', 'admin']) {
      const box = within(group).getByLabelText(scope)
      expect((box as HTMLInputElement).checked).toBe(checked.includes(scope as never))
    }
  }
})

test('toggling a scope changes only that principal', () => {
  const settings = renderAccess()
  const group = screen.getByRole('group', { name: 'Scopes for desktop-agent' })

  fireEvent.click(within(group).getByLabelText('admin'))
  expect(settings().auth_principals[0].scopes).toEqual(['query', 'admin'])
  expect(settings().auth_principals[1].scopes).toEqual(['status'])

  // The edited principal re-renders, so look its group up again.
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Scopes for desktop-agent' })).getByLabelText('query')
  )
  expect(settings().auth_principals[0].scopes).toEqual(['admin'])
})

test('a principal card keeps its title and a named remove action in one heading row', () => {
  renderAccess()
  const remove = screen.getByRole('button', { name: 'Remove desktop-agent' })
  const row = remove.parentElement as HTMLElement
  expect(within(row).getByText('desktop-agent')).toBeTruthy()
})

import { afterEach, expect, mock, test } from 'bun:test'
import { cleanup, fireEvent, render, screen, waitFor, within } from 'solid-testing-library'
import userEvent from '@testing-library/user-event'
import { createSignal } from 'solid-js'

import type { DesktopSettings } from '../../types'
import { desktopSettings } from '../../test/fixtures'
import { AccessSection } from './AccessSection'
import { SettingsConfirmProvider } from './SettingsConfirm'

afterEach(cleanup)

const scopeBox = (principal: string, scope: string) =>
  within(screen.getByRole('group', { name: `Scopes for ${principal}` })).getByLabelText(
    scope
  ) as HTMLInputElement
const card = (principal: string) =>
  screen.getByRole('group', { name: `Scopes for ${principal}` }).closest('[data-slot="card"]')

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

test('repeated keyboard toggles keep focus on the same checkbox and change only that principal', async () => {
  const user = userEvent.setup()
  const settings = renderAccess()
  const otherCard = card('ops-agent')
  const otherBoxes = ['query', 'status', 'admin'].map((scope) => scopeBox('ops-agent', scope))
  const otherChecked = otherBoxes.map((box) => box.checked)
  const otherNameInput = screen.getByDisplayValue('ops-agent')

  const admin = scopeBox('desktop-agent', 'admin')
  admin.focus()
  expect(document.activeElement === admin).toBe(true)

  await user.keyboard(' ')
  expect(settings().auth_principals[0].scopes).toEqual(['query', 'admin'])
  expect(document.activeElement === admin).toBe(true)
  expect(admin.checked).toBe(true)

  await user.keyboard(' ')
  expect(settings().auth_principals[0].scopes).toEqual(['query'])
  expect(document.activeElement === admin).toBe(true)
  expect(admin.checked).toBe(false)

  // Tab to a sibling scope of the same principal and toggle it from the keyboard.
  await user.tab({ shift: true })
  const status = scopeBox('desktop-agent', 'status')
  expect(document.activeElement === status).toBe(true)
  await user.keyboard(' ')
  expect(settings().auth_principals[0].scopes).toEqual(['query', 'status'])
  expect(document.activeElement === status).toBe(true)
  expect(scopeBox('desktop-agent', 'status') === status).toBe(true)
  expect(scopeBox('desktop-agent', 'admin') === admin).toBe(true)

  // The other principal is untouched: same DOM nodes, same state, same data.
  expect(card('ops-agent') === otherCard).toBe(true)
  expect(screen.getByDisplayValue('ops-agent') === otherNameInput).toBe(true)
  expect(
    ['query', 'status', 'admin'].map(
      (scope, position) => scopeBox('ops-agent', scope) === otherBoxes[position]
    )
  ).toEqual([true, true, true])
  expect(otherBoxes.map((box) => box.checked)).toEqual(otherChecked)
  expect(settings().auth_principals[1]).toEqual({
    principal: 'ops-agent',
    token_env: 'CORTANA_OPS_TOKEN',
    scopes: ['status'],
    acl: ['*'],
  })
})

test('typing in a principal field keeps the same input focused', async () => {
  const user = userEvent.setup()
  const settings = renderAccess()
  const name = screen.getByDisplayValue('desktop-agent') as HTMLInputElement
  name.focus()
  await user.keyboard('-2')
  expect(settings().auth_principals[0].principal).toBe('desktop-agent-2')
  expect(document.activeElement === name).toBe(true)
  expect(screen.getByDisplayValue('desktop-agent-2') === name).toBe(true)
})

test('removing a principal leaves the others showing their own values and scopes', async () => {
  const user = userEvent.setup()
  const settings = renderAccess()
  const nativeConfirm = window.confirm
  window.confirm = () => true
  try {
    await user.click(screen.getByRole('button', { name: 'Remove desktop-agent' }))
  } finally {
    window.confirm = nativeConfirm
  }

  expect(settings().auth_principals.map((principal) => principal.principal)).toEqual(['ops-agent'])
  expect(screen.queryByDisplayValue('desktop-agent')).toBeNull()
  expect(screen.queryByRole('group', { name: 'Scopes for desktop-agent' })).toBeNull()
  const group = screen.getByRole('group', { name: 'Scopes for ops-agent' })
  expect(
    within(group)
      .getAllByRole('checkbox')
      .map((box) => (box as HTMLInputElement).checked)
  ).toEqual([false, true, false])
  expect((screen.getByDisplayValue('CORTANA_OPS_TOKEN') as HTMLInputElement).value).toBe(
    'CORTANA_OPS_TOKEN'
  )
})

test('the stored-token clear action sits inside the token field under the same name', () => {
  const [settings, setSettings] = createSignal<DesktopSettings>({
    ...desktopSettings,
    auth_principals: [
      {
        principal: 'desktop-agent',
        token_env: 'CORTANA_DEMO_TOKEN',
        scopes: ['query'],
        acl: ['work'],
      },
    ],
    secrets: [{ name: 'CORTANA_DEMO_TOKEN', configured: true, source: 'secret-file' }],
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
  const field = screen.getByLabelText('New bearer token') as HTMLInputElement
  const clear = screen.getByRole('button', { name: 'Clear stored token' })
  expect(field.type).toBe('password')
  expect(clear.closest('[data-slot="input-group"]')).toBe(
    field.closest('[data-slot="input-group"]')
  )
})

// `onClear` depends on the stored secret and the cleared set, both of which
// change while the section is open: the action must appear and disappear with
// them while the field keeps its element, value and focus.
test('the clear action follows the configured and cleared state without remounting the field', async () => {
  const env = 'CORTANA_DEMO_TOKEN'
  const [secrets, setSecrets] = createSignal<DesktopSettings['secrets']>([])
  const [cleared, setCleared] = createSignal(new Set<string>())
  render(() => (
    <SettingsConfirmProvider>
      <AccessSection
        settings={{
          ...desktopSettings,
          auth_principals: [
            { principal: 'desktop-agent', token_env: env, scopes: ['query'], acl: ['work'] },
          ],
          secrets: secrets(),
        }}
        update={() => undefined}
        secretValues={{}}
        onSecret={() => undefined}
        clearedSecrets={cleared()}
        onClearSecret={() => undefined}
      />
    </SettingsConfirmProvider>
  ))
  const field = screen.getByLabelText('New bearer token') as HTMLInputElement
  field.focus()
  expect(screen.queryByRole('button', { name: 'Clear stored token' })).toBeNull()

  setSecrets([{ name: env, configured: true, source: 'secret-file' }])
  expect(screen.getByRole('button', { name: 'Clear stored token' })).toBeTruthy()
  expect(screen.getByLabelText('New bearer token')).toBe(field)
  expect(document.activeElement).toBe(field)

  setCleared(new Set([env]))
  expect(screen.queryByRole('button', { name: 'Clear stored token' })).toBeNull()
  expect(screen.getByLabelText('New bearer token')).toBe(field)
  expect(document.activeElement).toBe(field)
})

// Clearing a stored bearer token discards a secret, so its confirmation earns
// the destructive Continue. Everything is mocked: no token is read or changed.
function renderStoredToken() {
  const update = mock(() => undefined)
  const onClearSecret = mock((_name: string) => undefined)
  render(() => (
    <SettingsConfirmProvider>
      <AccessSection
        settings={{
          ...desktopSettings,
          auth_principals: [
            {
              principal: 'desktop-agent',
              token_env: 'CORTANA_DEMO_TOKEN',
              scopes: ['query'],
              acl: ['work'],
            },
          ],
          secrets: [{ name: 'CORTANA_DEMO_TOKEN', configured: true, source: 'secret-file' }],
        }}
        update={update}
        secretValues={{}}
        onSecret={() => undefined}
        clearedSecrets={new Set()}
        onClearSecret={onClearSecret}
      />
    </SettingsConfirmProvider>
  ))
  return { update, onClearSecret }
}

test('clearing a stored bearer token asks first, with the destructive Continue', async () => {
  const { update, onClearSecret } = renderStoredToken()

  fireEvent.click(screen.getByRole('button', { name: 'Clear stored token' }))
  const dialog = await screen.findByRole('alertdialog', { name: 'Confirm this action' })
  expect(dialog.textContent).toContain('Clear the stored bearer token for desktop-agent?')
  expect(screen.getByRole('button', { name: 'Continue' }).className).toMatch(/destructive/)
  expect(onClearSecret).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await waitFor(() => expect(onClearSecret).toHaveBeenCalledTimes(1))
  expect(onClearSecret).toHaveBeenCalledWith('CORTANA_DEMO_TOKEN')
  expect(update).not.toHaveBeenCalled()
})

test('cancelling the bearer token clear changes nothing and saves nothing', async () => {
  const { update, onClearSecret } = renderStoredToken()

  fireEvent.click(screen.getByRole('button', { name: 'Clear stored token' }))
  await screen.findByRole('alertdialog', { name: 'Confirm this action' })
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())

  expect(onClearSecret).not.toHaveBeenCalled()
  expect(update).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Clear stored token' })).toBeTruthy()
})

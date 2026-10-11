import { afterEach, expect, test } from 'bun:test'
import { cleanup, render, screen, waitFor } from 'solid-testing-library'
import userEvent from '@testing-library/user-event'
import { createSignal } from 'solid-js'
import { SettingsModelCombobox } from './SettingsModelCombobox'

afterEach(() => cleanup())

const choices = [
  { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
  { value: 'gpt-4o', label: 'GPT-4o' },
]

function renderModelCombobox(
  options: { value?: string; disabled?: boolean; showClear?: boolean } = {}
) {
  const [value, setValue] = createSignal(options.value ?? '')
  const changes: string[] = []

  render(() => (
    <SettingsModelCombobox
      aria-label="Model catalog"
      value={value()}
      choices={choices}
      disabled={options.disabled}
      showClear={options.showClear}
      onValueChange={(next) => {
        changes.push(next)
        setValue(next)
      }}
    />
  ))

  return { value, changes }
}

test('selects an advertised model by keyboard and keeps the ID controlled', async () => {
  const user = userEvent.setup()
  const model = renderModelCombobox()
  const input = screen.getByRole('combobox', { name: 'Model catalog' }) as HTMLInputElement

  await user.click(input)
  await user.keyboard('{ArrowDown}{Enter}')

  await waitFor(() => expect(model.value()).toBe('gpt-4o-mini'))
  expect(input.value).toBe('GPT-4o mini')
  expect(model.changes).toEqual(['gpt-4o-mini'])
})

test('clear updates the controlled model value', async () => {
  const user = userEvent.setup()
  const model = renderModelCombobox({ value: 'gpt-4o-mini', showClear: true })
  const input = screen.getByRole('combobox', { name: 'Model catalog' }) as HTMLInputElement

  await user.click(screen.getByRole('button', { name: 'Clear selection' }))

  await waitFor(() => expect(model.value()).toBe(''))
  expect(input.value).toBe('')
  expect(model.changes).toEqual([''])
})

test('disabled model controls cannot open or clear the catalog', () => {
  renderModelCombobox({ value: 'gpt-4o-mini', disabled: true, showClear: true })

  expect(
    (screen.getByRole('combobox', { name: 'Model catalog' }) as HTMLInputElement).disabled
  ).toBe(true)
  expect(
    (screen.getByRole('button', { name: 'Toggle options' }) as HTMLButtonElement).disabled
  ).toBe(true)
  expect(screen.queryByRole('button', { name: 'Clear selection' })).toBeNull()
})

test('shows a status when filtering leaves no advertised models', async () => {
  const user = userEvent.setup()
  renderModelCombobox()
  const input = screen.getByRole('combobox', { name: 'Model catalog' })

  await user.type(input, 'no-such-model')

  const status = await screen.findByRole('status')
  expect(status.textContent?.trim()).toBe('No matching models.')
})

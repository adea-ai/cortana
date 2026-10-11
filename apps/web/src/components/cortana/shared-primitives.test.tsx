import { afterEach, expect, test } from 'bun:test'
import { cleanup, render, screen, waitFor } from 'solid-testing-library'
import userEvent from '@testing-library/user-event'
import { createSignal } from 'solid-js'
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxControl,
  ComboboxItem,
  ComboboxTrigger,
  ComboboxClear,
} from '@adea-ai/ui/components/ui/combobox'
import { Pagination } from '@adea-ai/ui/components/ui/pagination'
import { Input } from '@adea-ai/ui/components/ui/input'
import { Slider } from '@adea-ai/ui/components/ui/slider'
import { Textarea } from '@adea-ai/ui/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@adea-ai/ui/components/ui/toggle-group'
afterEach(() => cleanup())
test('supports keyboard selection through the shared combobox', async () => {
  const user = userEvent.setup()
  render(() => (
    <Combobox
      options={[
        {
          value: 'Personal',
          label: 'Personal',
        },
        {
          value: 'Work',
          label: 'Work',
        },
      ]}
      optionValue="value"
      optionTextValue="label"
      optionLabel="label"
      itemComponent={(props) => (
        <ComboboxItem item={props.item}>{props.item.rawValue.label}</ComboboxItem>
      )}
    >
      <ComboboxControl>
        <ComboboxInput aria-label="Workspace scope" />
        <ComboboxTrigger aria-label="Toggle options" />
      </ComboboxControl>
      <ComboboxContent />
    </Combobox>
  ))
  const input = screen.getByRole('combobox', {
    name: 'Workspace scope',
  })
  expect(
    screen.getByRole('button', {
      name: 'Toggle options',
    })
  ).toBeTruthy()
  await user.click(input)
  await user.keyboard('{ArrowDown}{Enter}')
  expect((input as HTMLInputElement).value).toBe('Personal')
})
test('names the combobox clear action and clears its controlled value', async () => {
  const choices = [
    { value: 'Personal', label: 'Personal' },
    { value: 'Work', label: 'Work' },
  ]
  const [value, setValue] = createSignal<(typeof choices)[number] | null>(choices[0]!)
  render(() => (
    <Combobox
      options={choices}
      value={value()}
      onChange={setValue}
      optionValue="value"
      optionTextValue="label"
      optionLabel="label"
      itemComponent={(props) => (
        <ComboboxItem item={props.item}>{props.item.rawValue.label}</ComboboxItem>
      )}
    >
      <ComboboxControl>
        <ComboboxInput aria-label="Workspace scope" />
        <ComboboxClear onClear={() => setValue(null)} />
      </ComboboxControl>
    </Combobox>
  ))
  const clear = screen.getByRole('button', { name: 'Clear selection' })
  await userEvent.setup().click(clear)
  expect(value()).toBeNull()
  expect(
    (screen.getByRole('combobox', { name: 'Workspace scope' }) as HTMLInputElement).value
  ).toBe('')
})
test('renders a scalar slider value with exactly one thumb', async () => {
  const { container } = render(() => <Slider aria-label="Relevance" defaultValue={[50]} />)
  await waitFor(() => {
    expect(screen.getAllByRole('slider', { name: 'Relevance' })).toHaveLength(1)
    expect((container.querySelector('input[type="range"]') as HTMLInputElement | null)?.value).toBe(
      '50'
    )
  })
})
test('honors vertical toggle-group keyboard orientation', async () => {
  const user = userEvent.setup()
  render(() => (
    <ToggleGroup orientation="vertical">
      <ToggleGroupItem value="recent">Recent</ToggleGroupItem>
      <ToggleGroupItem value="relevant">Relevant</ToggleGroupItem>
    </ToggleGroup>
  ))
  const recent = screen.getByRole('button', {
    name: 'Recent',
  })
  const relevant = screen.getByRole('button', {
    name: 'Relevant',
  })
  recent.focus()
  await user.keyboard('{ArrowDown}')
  expect(document.activeElement).toBe(relevant)
})
test('shared pagination selects a page and exposes the current page', async () => {
  const user = userEvent.setup()
  const [page, setPage] = createSignal(1)
  render(() => <Pagination count={3} page={page()} onPageChange={setPage} />)
  const second = screen.getByRole('button', { name: '2', exact: true })
  await user.click(second)
  expect(page()).toBe(2)
  expect(second.getAttribute('aria-current')).toBe('page')
})
test('text inputs deliver live values through the native input event', async () => {
  const user = userEvent.setup()
  const inputValues: string[] = []
  const textareaValues: string[] = []
  render(() => (
    <>
      <Input aria-label="Name" onInput={(event) => inputValues.push(event.currentTarget.value)} />
      <Textarea
        aria-label="Notes"
        onInput={(event) => textareaValues.push(event.currentTarget.value)}
      />
    </>
  ))
  const input = screen.getByLabelText('Name')
  const textarea = screen.getByLabelText('Notes')
  await user.type(input, 'ab')
  await user.type(textarea, 'xy')
  // Each keystroke must deliver the latest value; a trailing native change
  // event may echo the final value again.
  expect(inputValues.slice(0, 2)).toEqual(['a', 'ab'])
  expect(textareaValues.slice(0, 2)).toEqual(['x', 'xy'])
})

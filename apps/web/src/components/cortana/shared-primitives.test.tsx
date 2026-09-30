import { afterEach, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen, waitFor } from 'solid-testing-library'
import userEvent from '@testing-library/user-event'
import {
  Combobox,
  ComboboxClear,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
} from '@adea-ai/ui/components/ui/combobox'
import { Pagination } from '@adea-ai/ui/components/ui/pagination'
import { Input } from '@adea-ai/ui/components/ui/input'
import { Slider } from '@adea-ai/ui/components/ui/slider'
import { Textarea } from '@adea-ai/ui/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@adea-ai/ui/components/ui/toggle-group'
afterEach(() => cleanup())
test('supports keyboard selection through the shared combobox', async () => {
  const user = userEvent.setup()
  let selected = ''
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
      value={null}
      onChange={(option) => {
        if (option) selected = String(option.value)
      }}
      itemComponent={(itemProps) => (
        <ComboboxItem item={itemProps.item}>{itemProps.item.rawValue?.label}</ComboboxItem>
      )}
    >
      <ComboboxInput aria-label="Workspace scope" />
      <ComboboxContent />
    </Combobox>
  ))
  const input = screen.getByRole('combobox', {
    name: 'Workspace scope',
  })
  await user.type(input, 'Pers')
  await user.keyboard('{ArrowDown}{Enter}')
  expect(selected).toBe('Personal')
})
test('names the combobox clear action', () => {
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
      value={{ value: 'Personal', label: 'Personal' }}
      itemComponent={(itemProps) => (
        <ComboboxItem item={itemProps.item}>{itemProps.item.rawValue?.label}</ComboboxItem>
      )}
    >
      <ComboboxInput aria-label="Workspace scope" />
      <ComboboxClear onClear={() => {}} />
    </Combobox>
  ))
  expect(
    screen.getByRole('button', {
      name: 'Clear selection',
    })
  ).toBeTruthy()
})
test('renders a scalar slider value with exactly one thumb', async () => {
  render(() => <Slider aria-label="Relevance" defaultValue={[50]} />)
  expect(screen.getAllByRole('slider')).toHaveLength(1)
  await waitFor(() => {
    expect((document.querySelector('input[type="range"]') as HTMLInputElement | null)?.value).toBe(
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
test('keeps pagination navigable through real controls', () => {
  let changed = -1
  render(() => (
    <Pagination
      count={30}
      page={2}
      onPageChange={(page: number) => {
        changed = page
      }}
    />
  ))
  expect(screen.getByText('2')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(changed).toBe(3)
})
test('text inputs invoke onInput per keystroke, not only on commit', async () => {
  const user = userEvent.setup()
  const inputValues: string[] = []
  const textareaValues: string[] = []
  render(() => (
    <>
      <Input
        aria-label="Name"
        onInput={(event: Event & { currentTarget: HTMLInputElement }) =>
          inputValues.push(event.currentTarget.value)
        }
      />
      <Textarea
        aria-label="Notes"
        onInput={(event: Event & { currentTarget: HTMLTextAreaElement }) =>
          textareaValues.push(event.currentTarget.value)
        }
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

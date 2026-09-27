import { afterEach, expect, test } from 'bun:test'
import { cleanup, render, screen, waitFor } from 'solid-testing-library'
import userEvent from '@testing-library/user-event'
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxList,
} from '@/components/shadcn/combobox'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from '@/components/shadcn/pagination'
import { Input } from '@/components/shadcn/input'
import { Slider } from '@/components/shadcn/slider'
import { Textarea } from '@/components/shadcn/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/shadcn/toggle-group'
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
    >
      <ComboboxInput aria-label="Workspace scope" />
      <ComboboxContent>
        <ComboboxList />
      </ComboboxContent>
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
      defaultValue={[
        {
          value: 'Personal',
          label: 'Personal',
        },
      ]}
    >
      <ComboboxInput aria-label="Workspace scope" showClear />
    </Combobox>
  ))
  expect(
    screen.getByRole('button', {
      name: 'Clear selection',
    })
  ).toBeTruthy()
})
test('renders a scalar slider value with exactly one thumb', async () => {
  const { container } = render(() => <Slider aria-label="Relevance" defaultValue={[50]} />)
  await waitFor(() => {
    expect(container.querySelectorAll('[data-slot="slider-thumb"]')).toHaveLength(1)
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
test('keeps pagination links exposed as links', () => {
  render(() => (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationLink href="/?page=2">2</PaginationLink>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  ))
  const link = screen.getByRole('link', {
    name: '2',
  })
  expect(link.getAttribute('href')).toBe('/?page=2')
  expect(link.getAttribute('role')).toBeNull()
  expect(
    screen.queryByRole('button', {
      name: '2',
    })
  ).toBeNull()
})
test('text inputs invoke onChange per input event, not only on commit', async () => {
  const user = userEvent.setup()
  const inputValues: string[] = []
  const textareaValues: string[] = []
  render(() => (
    <>
      <Input aria-label="Name" onChange={(event) => inputValues.push(event.currentTarget.value)} />
      <Textarea
        aria-label="Notes"
        onChange={(event) => textareaValues.push(event.currentTarget.value)}
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

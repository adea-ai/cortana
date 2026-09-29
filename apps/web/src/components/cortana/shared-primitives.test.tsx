import { afterEach, expect, mock, test } from 'bun:test'
import { cleanup, fireEvent, render, screen, waitFor } from 'solid-testing-library'
import userEvent from '@testing-library/user-event'
import { createSignal } from 'solid-js'
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
import { AsyncButton } from './async-button'
import { FeedbackState } from './feedback-state'
import { StatusBadge } from './status-badge'
import { ValidatedInput } from './validated-input'
afterEach(() => cleanup())
test('announces status and exposes a consistent busy button contract', () => {
  render(() => (
    <>
      <StatusBadge tone="warning">Sync degraded</StatusBadge>
      <AsyncButton busy busyLabel="Saving source">
        Save source
      </AsyncButton>
    </>
  ))
  expect(screen.getByRole('status').textContent).toContain('Sync degraded')
  const button = screen.getByRole('button', {
    name: 'Saving source',
  })
  expect(button.getAttribute('aria-busy')).toBe('true')
  expect((button as HTMLButtonElement).disabled).toBe(true)
})
test('announces busy status semantics', () => {
  render(() => <StatusBadge tone="busy">Indexing</StatusBadge>)
  const status = screen.getByRole('status')
  expect(status.getAttribute('aria-busy')).toBe('true')
  expect(status.textContent).toContain('Indexing')
})
test('keeps error recovery keyboard-operable', async () => {
  const retry = mock(() => undefined)
  const user = userEvent.setup()
  render(() => (
    <FeedbackState
      kind="error"
      title="Index unavailable"
      description="The last bounded request failed."
      onRetry={retry}
    />
  ))
  const button = screen.getByRole('button', {
    name: 'Retry',
  })
  await user.tab()
  await user.keyboard('{Enter}')
  expect(document.activeElement).toBe(button)
  expect(retry).toHaveBeenCalledTimes(1)
})
test('labels loading and empty feedback without browser-native chrome', () => {
  const [kind, setKind] = createSignal<'loading' | 'empty'>('loading')
  render(() => (
    <FeedbackState
      kind={kind()}
      title={kind() === 'loading' ? 'Loading evidence' : 'No evidence'}
      description={kind() === 'loading' ? 'Preparing results.' : 'Try another query.'}
    />
  ))
  expect(
    screen
      .getByRole('status', {
        name: 'Loading evidence: Preparing results.',
      })
      .getAttribute('aria-busy')
  ).toBe('true')
  setKind('empty')
  expect(screen.getByText('No evidence')).toBeTruthy()
  expect(screen.getByText('Try another query.')).toBeTruthy()
})
test('associates field help and validation errors programmatically', () => {
  render(() => (
    <ValidatedInput
      id="provider-url"
      label="Provider URL"
      description="Use an approved HTTPS endpoint."
      error="Enter a valid HTTPS URL."
      value="http://example.test"
    />
  ))
  const input = screen.getByRole('textbox', {
    name: 'Provider URL',
  })
  expect(input.getAttribute('aria-invalid')).toBe('true')
  expect(input.getAttribute('aria-describedby')).toBe('provider-url-description provider-url-error')
  expect(screen.getByRole('alert').textContent).toBe('Enter a valid HTTPS URL.')
})
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

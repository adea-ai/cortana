import { afterEach, expect, test } from 'bun:test'
import { createSignal } from 'solid-js'
import { cleanup, fireEvent, render, screen, waitFor } from 'solid-testing-library'

import { ActionButton } from '@adea-ai/ui/components/composites/action-button'
import { M7CommandPalette } from './M7CommandPalette'

afterEach(cleanup)

test('the command palette is named, Escape dismisses it, and focus returns to its opener', async () => {
  const finalFocus = { current: null as HTMLElement | null }

  function Harness() {
    const [open, setOpen] = createSignal(false)

    return (
      <>
        <ActionButton
          tooltip="Open the Cortana command palette"
          onClick={() => {
            finalFocus.current = document.activeElement as HTMLElement
            setOpen(true)
          }}
        >
          Open command palette
        </ActionButton>
        <M7CommandPalette
          open={open()}
          finalFocus={finalFocus}
          onOpenChange={(next) => setOpen(next)}
          workspaces={[]}
          onSearch={() => {}}
          onFilterDocuments={() => {}}
          onChooseWorkspace={() => {}}
          onOpenSettings={() => {}}
        />
      </>
    )
  }

  render(() => <Harness />)
  const opener = screen.getByRole('button', { name: 'Open command palette' })
  opener.focus()
  fireEvent.click(opener)

  const dialog = await screen.findByRole('dialog', { name: 'Cortana command palette' })
  const search = await screen.findByPlaceholderText('Search commands…')
  await waitFor(() => expect(document.activeElement).toBe(search))

  fireEvent.keyDown(search, { key: 'Escape' })

  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  await waitFor(() => expect(document.activeElement).toBe(opener))
  expect(dialog).toBeTruthy()
})

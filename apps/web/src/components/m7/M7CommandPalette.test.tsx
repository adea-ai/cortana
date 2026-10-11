import { afterEach, expect, test } from 'bun:test'
import { createSignal } from 'solid-js'
import { cleanup, fireEvent, render, screen, waitFor } from 'solid-testing-library'

import { ActionButton } from '@adea-ai/ui/components/composites/action-button'
import { M7CommandPalette } from './M7CommandPalette'

afterEach(cleanup)

function waitForFocus(element: HTMLElement, timeoutMs = 1_000): Promise<void> {
  if (document.activeElement === element) return Promise.resolve()

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      document.removeEventListener('focusin', handleFocus)
      reject(new Error(`Timed out waiting for focus on ${element.tagName.toLowerCase()}`))
    }, timeoutMs)
    const handleFocus = () => {
      if (document.activeElement !== element) return
      window.clearTimeout(timeout)
      document.removeEventListener('focusin', handleFocus)
      resolve()
    }

    document.addEventListener('focusin', handleFocus)
    handleFocus()
  })
}

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
  // Kobalte schedules initial focus in a zero-delay task.
  await waitForFocus(search)
  expect(document.activeElement).toBe(search)

  fireEvent.keyDown(search, { key: 'Escape' })

  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  await waitForFocus(opener)
  expect(document.activeElement).toBe(opener)
  expect(dialog).toBeTruthy()
})

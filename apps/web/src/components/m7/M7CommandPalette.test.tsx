import { afterEach, expect, test } from 'bun:test'
import { createSignal } from 'solid-js'
import { cleanup, fireEvent, render, screen, waitFor } from 'solid-testing-library'

import { M7CommandPalette } from './M7CommandPalette'

afterEach(cleanup)

test('the command palette is named, keyboard-dismissible, and restores its explicit opener', async () => {
  const finalFocus = { current: null as HTMLElement | null }
  let opener: HTMLButtonElement | null = null

  function Harness() {
    const [open, setOpen] = createSignal(false)

    return (
      <>
        <button
          type="button"
          ref={(element) => (opener = element)}
          onClick={() => {
            finalFocus.current = opener
            setOpen(true)
          }}
        >
          Open command palette
        </button>
        <M7CommandPalette
          open={open()}
          finalFocus={finalFocus}
          onOpenChange={setOpen}
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
  fireEvent.click(screen.getByRole('button', { name: 'Open command palette' }))

  const dialog = await screen.findByRole('dialog', { name: 'Cortana command palette' })
  const search = await screen.findByPlaceholderText('Search commands…')
  await waitFor(() => expect(document.activeElement).toBe(search))

  fireEvent.keyDown(search, { key: 'Escape' })

  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  await waitFor(() => expect(document.activeElement).toBe(opener))
  expect(dialog).toBeTruthy()
})

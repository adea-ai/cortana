import { afterEach, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen, waitFor } from 'solid-testing-library'

import { SettingsConfirmProvider, useSettingsConfirm } from './SettingsConfirm'

afterEach(cleanup)

function ConfirmButton(props: { onResult: (confirmed: boolean) => void }) {
  const confirm = useSettingsConfirm()

  return (
    <button
      type="button"
      onClick={() => void Promise.resolve(confirm('Remove this source?')).then(props.onResult)}
    >
      Remove source
    </button>
  )
}

function renderConfirmation(onResult: (confirmed: boolean) => void) {
  return render(() => (
    <SettingsConfirmProvider>
      <ConfirmButton onResult={onResult} />
    </SettingsConfirmProvider>
  ))
}

test('a settings confirmation can be escaped and restores focus to its opener', async () => {
  let result: boolean | undefined
  renderConfirmation((confirmed) => (result = confirmed))
  const trigger = screen.getByRole('button', { name: 'Remove source' })

  trigger.focus()
  fireEvent.click(trigger)
  const dialog = await screen.findByRole('alertdialog', { name: 'Confirm this action' })
  expect(dialog).toBeTruthy()

  fireEvent.keyDown(document.activeElement ?? dialog, { key: 'Escape' })

  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  await waitFor(() => expect(result).toBe(false))
  await waitFor(() => expect(document.activeElement).toBe(trigger))
})

test('a settings confirmation can be dismissed outside and resolves as canceled', async () => {
  let result: boolean | undefined
  renderConfirmation((confirmed) => (result = confirmed))

  fireEvent.click(screen.getByRole('button', { name: 'Remove source' }))
  const dialog = await screen.findByRole('alertdialog', { name: 'Confirm this action' })
  await new Promise((resolve) => window.setTimeout(resolve, 0))
  const overlay = dialog.parentElement?.previousElementSibling
  if (!(overlay instanceof HTMLElement)) throw new Error('Expected the dialog overlay')
  fireEvent.pointerDown(overlay, { pointerType: 'mouse', button: 0 })
  fireEvent.pointerUp(overlay)

  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  await waitFor(() => expect(result).toBe(false))
})

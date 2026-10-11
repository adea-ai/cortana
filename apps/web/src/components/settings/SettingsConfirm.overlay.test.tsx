import { afterEach, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen, waitFor } from 'solid-testing-library'

import { ActionButton } from '@adea-ai/ui/components/composites/action-button'
import { SettingsConfirmProvider, useSettingsConfirm } from './SettingsConfirm'

afterEach(cleanup)

function ConfirmButton(props: { onResult: (confirmed: boolean) => void }) {
  const confirm = useSettingsConfirm()

  return (
    <ActionButton
      tooltip="Remove this source"
      onClick={() => void Promise.resolve(confirm('Remove this source?')).then(props.onResult)}
    >
      Remove source
    </ActionButton>
  )
}

function renderConfirmation(onResult: (confirmed: boolean) => void) {
  return render(() => (
    <SettingsConfirmProvider>
      <ConfirmButton onResult={onResult} />
    </SettingsConfirmProvider>
  ))
}

test('a settings confirmation can be canceled with its named action and restores focus', async () => {
  let result: boolean | undefined
  renderConfirmation((confirmed) => (result = confirmed))
  const trigger = screen.getByRole('button', { name: 'Remove source' })

  trigger.focus()
  fireEvent.click(trigger)
  expect(await screen.findByRole('alertdialog', { name: 'Confirm this action' })).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

  await waitFor(() => expect(result).toBe(false))
  await waitFor(() => expect(document.activeElement).toBe(trigger))
})

test('a settings confirmation stays open when its scrim is clicked', async () => {
  let result: boolean | undefined
  renderConfirmation((confirmed) => (result = confirmed))

  fireEvent.click(screen.getByRole('button', { name: 'Remove source' }))
  const dialog = await screen.findByRole('alertdialog', { name: 'Confirm this action' })
  const overlay = dialog.parentElement?.previousElementSibling
  if (!(overlay instanceof HTMLElement)) throw new Error('Expected the dialog overlay')
  fireEvent.pointerDown(overlay, { pointerType: 'mouse', button: 0, isPrimary: true })
  fireEvent.pointerUp(overlay)

  expect(screen.getByRole('alertdialog', { name: 'Confirm this action' })).toBe(dialog)
  expect(result).toBeUndefined()
})

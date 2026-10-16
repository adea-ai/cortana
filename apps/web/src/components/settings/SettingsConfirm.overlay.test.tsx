import { afterEach, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen, waitFor } from 'solid-testing-library'

import { ActionButton } from '@adea-ai/ui/components/composites/action-button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@adea-ai/ui/components/ui/dialog'
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

// Escape is the keyboard's Cancel: the question is answered "no" once, the dialog
// closes and focus goes back to the control that asked.
test('Escape alone answers a settings confirmation false exactly once and restores focus', async () => {
  const results: boolean[] = []
  renderConfirmation((confirmed) => results.push(confirmed))
  const trigger = screen.getByRole('button', { name: 'Remove source' })

  trigger.focus()
  fireEvent.click(trigger)
  const dialog = await screen.findByRole('alertdialog', { name: 'Confirm this action' })

  fireEvent.keyDown(dialog, { key: 'Escape' })

  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  await waitFor(() => expect(document.activeElement).toBe(trigger))
  // Let any late close notification or delayed focus restore run, then recount.
  await new Promise((resolve) => setTimeout(resolve, 150))
  expect(results).toEqual([false])
  expect(document.activeElement).toBe(trigger)

  // A second Escape with nothing open answers nothing.
  fireEvent.keyDown(document.body, { key: 'Escape' })
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(results).toEqual([false])
})

test('Escape closes only the confirmation and leaves its parent dialog open', async () => {
  const results: boolean[] = []
  render(() => (
    <SettingsConfirmProvider>
      <Dialog open>
        <DialogContent>
          <DialogTitle>Source settings</DialogTitle>
          <DialogDescription>Manage this source.</DialogDescription>
          <ConfirmButton onResult={(confirmed) => results.push(confirmed)} />
        </DialogContent>
      </Dialog>
    </SettingsConfirmProvider>
  ))
  const parent = await screen.findByRole('dialog', { name: 'Source settings' })
  const trigger = screen.getByRole('button', { name: 'Remove source' })

  trigger.focus()
  fireEvent.click(trigger)
  const confirmation = await screen.findByRole('alertdialog', { name: 'Confirm this action' })

  fireEvent.keyDown(confirmation, { key: 'Escape' })

  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  await waitFor(() => expect(results).toEqual([false]))
  // The parent is still the same open dialog, and focus is back on the control
  // inside it that asked the question.
  expect(screen.getByRole('dialog', { name: 'Source settings' })).toBe(parent)
  await waitFor(() => expect(document.activeElement).toBe(trigger))
  expect(parent.contains(document.activeElement)).toBe(true)
  await new Promise((resolve) => setTimeout(resolve, 150))
  expect(results).toEqual([false])
})

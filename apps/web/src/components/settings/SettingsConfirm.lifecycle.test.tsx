import { afterEach, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen, waitFor } from 'solid-testing-library'

import { Button } from '@adea-ai/ui/components/ui/button'
import { SettingsConfirmProvider, useSettingsConfirm } from './SettingsConfirm'

afterEach(cleanup)

type Confirm = ReturnType<typeof useSettingsConfirm>

// Hands the provider's confirm function to the test so it can be called outside
// a click handler, the way the shell's async actions call it.
function renderProbe() {
  const probe: { confirm: Confirm | null } = { confirm: null }
  function Probe() {
    probe.confirm = useSettingsConfirm()
    return <Button type="button">Opener</Button>
  }
  const view = render(() => (
    <SettingsConfirmProvider>
      <Probe />
    </SettingsConfirmProvider>
  ))
  return {
    ...view,
    ask(description: string): Promise<boolean> {
      if (!probe.confirm) throw new Error('The probe did not mount')
      return Promise.resolve(probe.confirm(description))
    },
  }
}

// A promise that never settles must fail the test instead of hanging the suite.
function settled<T>(promise: Promise<T>, label: string, ms = 1000) {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`${label} never settled`)), ms)
    }),
  ])
}

test('unmounting while a confirmation is pending resolves it false', async () => {
  const { ask, unmount } = renderProbe()
  const decision = ask('Install the update?')
  await screen.findByRole('alertdialog')

  unmount()

  expect(await settled(decision, 'the pending confirmation')).toBe(false)
})

test('a confirmation requested after the provider is gone resolves false immediately', async () => {
  const { ask, unmount } = renderProbe()
  unmount()

  expect(await settled(ask('Too late?'), 'the late confirmation')).toBe(false)
})

test('a newer confirmation supersedes the pending one, which resolves false', async () => {
  const { ask } = renderProbe()
  const first = ask('First question?')
  await screen.findByText('First question?')

  const second = ask('Second question?')
  expect(await settled(first, 'the superseded confirmation')).toBe(false)
  await screen.findByText('Second question?')
  expect(screen.queryByText('First question?')).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(await settled(second, 'the current confirmation')).toBe(true)
})

test('a confirmation settles once: the first answer wins and later ones are ignored', async () => {
  const { ask } = renderProbe()
  const decision = ask('Continue once?')
  const dialog = await screen.findByRole('alertdialog')
  const results: boolean[] = []
  void decision.then((confirmed) => results.push(confirmed))

  const cont = screen.getByRole('button', { name: 'Continue' })
  const cancel = screen.getByRole('button', { name: 'Cancel' })
  fireEvent.click(cont)
  fireEvent.click(cancel)
  fireEvent.keyDown(dialog, { key: 'Escape' })

  expect(await settled(decision, 'the confirmation')).toBe(true)
  await new Promise((resolve) => setTimeout(resolve, 80))
  expect(results).toEqual([true])
})

test('disposal does not touch the page: no focus moves after the provider unmounts', async () => {
  const { ask, unmount } = renderProbe()
  const opener = screen.getByRole('button', { name: 'Opener' })
  opener.focus()
  const decision = ask('Dispose me?')
  await screen.findByRole('alertdialog')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await settled(decision, 'the confirmation')

  // The cancel scheduled a delayed focus restore; unmounting must drop it.
  const bystander = document.createElement('input')
  document.body.append(bystander)
  unmount()
  bystander.focus()
  await new Promise((resolve) => setTimeout(resolve, 120))
  await waitFor(() => expect(document.activeElement).toBe(bystander))
  bystander.remove()
})

test('a superseding confirmation still returns focus to the original opener', async () => {
  const { ask } = renderProbe()
  const opener = screen.getByRole('button', { name: 'Opener' })
  opener.focus()
  const first = ask('First question?')
  await screen.findByText('First question?')
  // Focus is now inside the first dialog, which is what the second call sees.
  screen.getByRole('button', { name: 'Cancel' }).focus()
  const second = ask('Second question?')
  await settled(first, 'the superseded confirmation')
  await screen.findByText('Second question?')

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(await settled(second, 'the current confirmation')).toBe(false)
  await waitFor(() => expect(document.activeElement).toBe(opener))
})

test('focus waits for a trigger that is disabled while its confirmed action runs', async () => {
  const { ask } = renderProbe()
  const opener = screen.getByRole<HTMLButtonElement>('button', { name: 'Opener' })
  opener.focus()
  const decision = ask('Save it?')
  await screen.findByRole('alertdialog')
  // The confirmed action disables its control while it saves, and a disabled
  // control refuses focus (happy-dom does not enforce that, so model it).
  const focusControl = opener.focus.bind(opener)
  let disabled = true
  let attempts = 0
  opener.focus = () => {
    attempts += 1
    if (!disabled) focusControl()
  }
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await settled(decision, 'the confirmation')
  // Closing the dialog drops focus to <body>.
  opener.blur()
  await waitFor(() => expect(attempts).toBeGreaterThanOrEqual(3))
  expect(document.activeElement).not.toBe(opener)
  disabled = false
  await waitFor(() => expect(document.activeElement).toBe(opener))
})

test('focus falls back to the enclosing dialog when the trigger is gone', async () => {
  const probe: { confirm: Confirm | null } = { confirm: null }
  function Probe() {
    probe.confirm = useSettingsConfirm()
    return (
      <div role="dialog" aria-label="Host dialog" tabindex="-1">
        <Button type="button">Opener</Button>
      </div>
    )
  }
  render(() => (
    <SettingsConfirmProvider>
      <Probe />
    </SettingsConfirmProvider>
  ))
  const host = screen.getByRole('dialog', { name: 'Host dialog' })
  const opener = screen.getByRole('button', { name: 'Opener' })
  opener.focus()
  const decision = Promise.resolve(probe.confirm?.('Remove it?'))
  await screen.findByRole('alertdialog')
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(await settled(decision, 'the confirmation')).toBe(true)
  opener.remove()
  await waitFor(() => expect(document.activeElement).toBe(host))
})

test('focus the operator moves during the restore delay is left alone', async () => {
  const { ask } = renderProbe()
  const opener = screen.getByRole('button', { name: 'Opener' })
  const elsewhere = document.createElement('input')
  document.body.append(elsewhere)
  opener.focus()
  const decision = ask('Discard edits?')
  await screen.findByRole('alertdialog')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await settled(decision, 'the confirmation')

  // The operator clicks into another field before the delayed restore runs.
  elsewhere.focus()
  await new Promise((resolve) => setTimeout(resolve, 150))
  expect(document.activeElement).toBe(elsewhere)
  elsewhere.remove()
})

test('focus a confirmed action moves on purpose is not pulled back to the trigger', async () => {
  const { ask } = renderProbe()
  const opener = screen.getByRole('button', { name: 'Opener' })
  const target = document.createElement('button')
  document.body.append(target)
  opener.focus()
  const decision = ask('Restart now?')
  await screen.findByRole('alertdialog')
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await settled(decision, 'the confirmation')
  // The confirmed action finishes by focusing its own result.
  target.focus()
  await new Promise((resolve) => setTimeout(resolve, 150))
  expect(document.activeElement).toBe(target)
  target.remove()
})

test('the scope fallback does not take focus the operator already placed elsewhere', async () => {
  const probe: { confirm: Confirm | null } = { confirm: null }
  function Probe() {
    probe.confirm = useSettingsConfirm()
    return (
      <div role="dialog" aria-label="Host dialog" tabindex="-1">
        <Button type="button">Opener</Button>
        <Button type="button">Sibling</Button>
      </div>
    )
  }
  render(() => (
    <SettingsConfirmProvider>
      <Probe />
    </SettingsConfirmProvider>
  ))
  const host = screen.getByRole('dialog', { name: 'Host dialog' })
  const opener = screen.getByRole('button', { name: 'Opener' })
  const outside = document.createElement('input')
  document.body.append(outside)
  opener.focus()
  const decision = Promise.resolve(probe.confirm?.('Remove it?'))
  await screen.findByRole('alertdialog')
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await settled(decision, 'the confirmation')
  opener.remove()
  outside.focus()
  await new Promise((resolve) => setTimeout(resolve, 150))
  expect(document.activeElement).toBe(outside)
  expect(document.activeElement).not.toBe(host)
  outside.remove()
})

test('focus is still restored to the trigger when nothing has taken it', async () => {
  const { ask } = renderProbe()
  const opener = screen.getByRole('button', { name: 'Opener' })
  opener.focus()
  const decision = ask('Cancel me?')
  await screen.findByRole('alertdialog')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await settled(decision, 'the confirmation')
  await waitFor(() => expect(document.activeElement).toBe(opener))
})

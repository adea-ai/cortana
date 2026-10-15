import { createContext, createSignal, onCleanup, useContext, type JSX } from 'solid-js'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@adea-ai/ui/components/ui/alert-dialog'

type ConfirmSettingsAction = (description: string) => boolean | Promise<boolean>

// Existing behavior tests inject a deterministic confirm function. Preserve
// that seam without exposing the browser-native dialog in production.
const initialWindowConfirm = window.confirm

const SettingsConfirmContext = createContext<ConfirmSettingsAction>((description) =>
  window.confirm(description)
)

// How many extra 50 ms attempts to return focus to a trigger that is still
// disabled by the action it started (about a second and a half in all).
const FOCUS_RESTORE_RETRIES = 30

type PendingConfirmation = {
  description: string
  resolve: (confirmed: boolean) => void
  trigger: HTMLElement | null
  scope: HTMLElement | null
}

// Focus is "stranded" when nothing meaningful holds it: on <body> (the closed
// dialog's button was removed) or still inside the dialog that is closing.
const focusStranded = () => {
  const active = document.activeElement
  return !active || active === document.body || active.closest('[role="alertdialog"]') !== null
}

export function SettingsConfirmProvider(props: { children: JSX.Element }) {
  const [pending, setPending] = createSignal<PendingConfirmation | null>(null)
  let pendingRef: PendingConfirmation | null = null
  let restoreTimer: number | undefined
  let disposed = false

  const restoreFocus = (current: PendingConfirmation) => {
    // A confirmed action may remove its trigger, so wait until Solid commits
    // that action before choosing the surviving target.
    window.clearTimeout(restoreTimer)
    const attempt = (retries: number) => {
      restoreTimer = window.setTimeout(() => {
        if (disposed) return
        const { trigger, scope } = current
        if (trigger?.isConnected) {
          trigger.focus()
          if (document.activeElement === trigger) return
          // The trigger cannot take focus yet: a confirmed action disables it
          // while it saves. Keep trying briefly, unless the operator has since
          // moved focus somewhere real.
          if (!focusStranded()) return
          if (retries > 0) return attempt(retries - 1)
        }
        if (!scope?.isConnected) return
        const fallback =
          scope.querySelector<HTMLElement>(
            '[data-slot="settings-navigation-trigger"][aria-selected="true"]'
          ) ??
          // An enclosing dialog (the Updates dialog) keeps focus on itself so
          // the dialog stays operable from the keyboard.
          (scope.matches('[role="dialog"]') ? scope : null) ??
          scope.querySelector<HTMLElement>(
            'button:not([disabled]):not([aria-disabled=true]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
          )
        if (fallback?.isConnected) fallback.focus()
      }, 50)
    }
    attempt(FOCUS_RESTORE_RETRIES)
  }

  // Every way a confirmation ends goes through here, so each one resolves its
  // promise exactly once: nulling `pendingRef` first makes a second answer (the
  // Action click followed by the dialog's own close, say) a no-op.
  const settle = (confirmed: boolean) => {
    const current = pendingRef
    if (!current) return
    pendingRef = null
    setPending(null)
    current.resolve(confirmed)
    restoreFocus(current)
  }

  // Disposal must not leave the awaiting async action hanging forever, and it
  // must not touch the page once its owner is gone: resolve the pending
  // confirmation as declined and drop any delayed focus restore.
  onCleanup(() => {
    disposed = true
    window.clearTimeout(restoreTimer)
    const current = pendingRef
    pendingRef = null
    current?.resolve(false)
  })

  const confirm: ConfirmSettingsAction = (description) => {
    if (disposed) return Promise.resolve(false)
    const superseded = pendingRef
    if (superseded) {
      // The newer question replaces the open one: decline the old one without
      // closing the dialog or restoring focus behind the new question.
      pendingRef = null
      superseded.resolve(false)
    }
    if (window.confirm !== initialWindowConfirm) return window.confirm(description)
    window.clearTimeout(restoreTimer)
    return new Promise<boolean>((resolve) => {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
      // While the old dialog is still open the active element is its button, so
      // the new question inherits the original opener to return focus to.
      const opener = active?.closest('[role="alertdialog"]') ? superseded : null
      const next = {
        description,
        resolve,
        trigger: opener ? opener.trigger : active,
        scope: opener
          ? opener.scope
          : (active?.closest<HTMLElement>('.settings-view') ??
            active?.closest<HTMLElement>('[role="dialog"]') ??
            null),
      }
      pendingRef = next
      setPending(next)
    })
  }

  return (
    <SettingsConfirmContext.Provider value={confirm}>
      {props.children}
      <AlertDialog open={Boolean(pending())} onOpenChange={(open) => !open && settle(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm this action</AlertDialogTitle>
            <AlertDialogDescription class="whitespace-pre-line">
              {pending()?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => settle(true)}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsConfirmContext.Provider>
  )
}

// The hook and provider intentionally share one module-scoped confirmation context.
export function useSettingsConfirm() {
  return useContext(SettingsConfirmContext)
}

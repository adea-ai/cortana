import { createContext, createSignal, onCleanup, useContext, type JSX } from 'solid-js'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@adea-ai/ui/components/ui/dialog'
import { Button } from '@adea-ai/ui/components/ui/button'

type ConfirmSettingsAction = (description: string) => boolean | Promise<boolean>

// Existing behavior tests inject a deterministic confirm function. Preserve
// that seam without exposing the browser-native dialog in production.
const initialWindowConfirm = window.confirm

const SettingsConfirmContext = createContext<ConfirmSettingsAction>((description) =>
  window.confirm(description)
)

type PendingConfirmation = {
  description: string
  resolve: (confirmed: boolean) => void
  trigger: HTMLElement | null
  scope: HTMLElement | null
}

export function SettingsConfirmProvider(props: { children: JSX.Element }) {
  const [pending, setPending] = createSignal<PendingConfirmation | null>(null)
  let pendingRef: PendingConfirmation | null = null
  let restoreRef: (PendingConfirmation & { confirmed: boolean }) | null = null

  const restoreFocus = (event: Event) => {
    const current = restoreRef
    if (!current) return
    restoreRef = null
    event.preventDefault()
    current.resolve(current.confirmed)
    // Resolve first because a confirmed action may remove its trigger. Wait
    // until Solid commits that action before choosing the surviving target.
    window.setTimeout(() => {
      if (current.trigger?.isConnected) {
        current.trigger.focus()
        return
      }
      const fallback =
        current.scope?.querySelector<HTMLElement>('.settings-nav-item.active') ??
        current.scope?.querySelector<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
        )
      if (fallback?.isConnected) fallback.focus()
    }, 50)
  }

  const settle = (confirmed: boolean) => {
    const current = pendingRef
    if (!current) return
    pendingRef = null
    restoreRef = { ...current, confirmed }
    setPending(null)
  }

  onCleanup(() => {
    const current = pendingRef
    const restoring = restoreRef
    pendingRef = null
    restoreRef = null
    current?.resolve(false)
    restoring?.resolve(restoring.confirmed)
  })

  const confirm: ConfirmSettingsAction = (description) => {
    settle(false)
    if (window.confirm !== initialWindowConfirm) return window.confirm(description)
    return new Promise<boolean>((resolve) => {
      const next = {
        description,
        resolve,
        trigger: document.activeElement instanceof HTMLElement ? document.activeElement : null,
        scope:
          document.activeElement instanceof HTMLElement
            ? document.activeElement.closest<HTMLElement>('.settings-view')
            : null,
      }
      pendingRef = next
      setPending(next)
    })
  }

  return (
    <SettingsConfirmContext.Provider value={confirm}>
      {props.children}
      <Dialog open={Boolean(pending())} onOpenChange={(open) => !open && settle(false)}>
        <DialogContent role="alertdialog" closeButton={false} onCloseAutoFocus={restoreFocus}>
          <DialogHeader>
            <DialogTitle>Confirm this action</DialogTitle>
            <DialogDescription class="whitespace-pre-line">
              {pending()?.description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => settle(false)}>
              Cancel
            </Button>
            <Button variant="destructive" type="button" onClick={() => settle(true)}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsConfirmContext.Provider>
  )
}

// The hook and provider intentionally share one module-scoped confirmation context.
export function useSettingsConfirm() {
  return useContext(SettingsConfirmContext)
}

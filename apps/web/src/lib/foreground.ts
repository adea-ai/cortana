import { createSignal, onCleanup, type Accessor } from 'solid-js'

import { isDesktopApp } from '../api'

/**
 * Shared foreground/visibility signal. Browser visibilitychange and
 * focus/blur events cover the web shell; the desktop webview additionally
 * tracks the native window focus listener because Tauri does not always emit
 * window focus events for webview-level interaction changes.
 *
 * One signal and one listener set back every caller: App-level polling,
 * source-job polling, and several settings workflows all consumed separate
 * copies, which registered duplicate DOM listeners and one native
 * onFocusChanged subscription per consumer.
 */
export function useDesktopForeground(): Accessor<boolean> {
  subscribers += 1
  if (subscribers === 1) install()
  onCleanup(() => {
    subscribers -= 1
    if (subscribers === 0) teardown()
  })
  return foreground
}

const [foreground, setForeground] = createSignal(
  typeof document === 'undefined' || document.visibilityState !== 'hidden'
)

let subscribers = 0
let visible = typeof document === 'undefined' || document.visibilityState !== 'hidden'
let focused = true
let unlistenFocus: (() => void) | undefined
let disposed = true

const syncForeground = () => setForeground(visible && focused)
const markVisible = () => {
  visible = document.visibilityState !== 'hidden'
  syncForeground()
}
const markFocused = () => {
  focused = true
  syncForeground()
}
const markBlurred = () => {
  focused = false
  syncForeground()
}

function install() {
  if (typeof window === 'undefined') return
  disposed = false
  visible = document.visibilityState !== 'hidden'
  // Resync focus on every install: a blurred window will not re-emit blur, so
  // a shared stale flag would freeze every later subscriber in the background
  // state. The Tauri snapshot below still corrects an inaccurate guess.
  focused = typeof document.hasFocus === 'function' ? document.hasFocus() : true
  syncForeground()
  window.addEventListener('focus', markFocused)
  window.addEventListener('blur', markBlurred)
  document.addEventListener('visibilitychange', markVisible)
  if (isDesktopApp && '__TAURI_INTERNALS__' in window) {
    void import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => {
        const currentWindow = getCurrentWindow()
        void currentWindow
          .isFocused()
          .then((payload) => {
            if (!disposed) {
              focused = payload
              syncForeground()
            }
            return null
          })
          .catch(() => {
            // Browser focus events remain the fallback when the native
            // startup snapshot is unavailable.
          })
        return currentWindow.onFocusChanged(({ payload }) => {
          if (!disposed) {
            focused = payload
            syncForeground()
          }
        })
      })
      .then((unlisten) => {
        if (disposed) unlisten()
        else unlistenFocus = unlisten
        return null
      })
      .catch(() => {
        // Browser focus events remain the fallback when the native focus
        // listener cannot be registered during startup.
      })
  }
}

function teardown() {
  disposed = true
  window.removeEventListener('focus', markFocused)
  window.removeEventListener('blur', markBlurred)
  document.removeEventListener('visibilitychange', markVisible)
  unlistenFocus?.()
  unlistenFocus = undefined
}

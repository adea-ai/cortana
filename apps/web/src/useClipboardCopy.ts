import { createSignal, onCleanup } from 'solid-js'

import { writeClipboardText } from './clipboard'

export function useClipboardCopy(value: string | null | (() => string | null)) {
  const [copied, setCopied] = createSignal(false)
  const [copyError, setCopyError] = createSignal('')
  let resetTimer: number | null = null
  let mounted = true

  onCleanup(() => {
    mounted = false
    if (resetTimer !== null) window.clearTimeout(resetTimer)
  })

  const copy = async () => {
    const current = typeof value === 'function' ? value() : value
    if (current === null) return
    setCopyError('')
    try {
      await writeClipboardText(current)
      if (!mounted) return
      setCopied(true)
      if (resetTimer !== null) window.clearTimeout(resetTimer)
      resetTimer = window.setTimeout(() => {
        resetTimer = null
        setCopied(false)
      }, 1800)
    } catch (caught) {
      if (!mounted) return
      setCopied(false)
      setCopyError(caught instanceof Error ? caught.message : 'Unable to copy context')
    }
  }

  return { copied, copyError, copy }
}

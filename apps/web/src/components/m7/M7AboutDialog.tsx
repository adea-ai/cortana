import { ExternalLink } from 'lucide-solid'
import { createMemo, Show } from 'solid-js'

import { openDesktopUrl } from '@/api'
import { Button } from '@/components/shadcn/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/shadcn/dialog'
import { useClipboardCopy } from '@/useClipboardCopy'

const SOURCE_URL = 'https://github.com/adea-ai/cortana'

/**
 * Identity dialog behind the rail's About entry, shaped like the one in the
 * sibling shell: the app mark, its version, and the two things a support
 * conversation asks for (a copyable version block and the source link).
 */
export function M7AboutDialog(props: {
  open: boolean
  onClose: () => void
  version?: string
  platform: 'desktop' | 'web'
  /** Routes the source link through the native browser when packaged. */
  desktopAvailable: boolean
}) {
  const versionLabel = () => (props.version ? `Version ${props.version}` : 'Version unavailable')
  const versionInfo = createMemo(() =>
    ['Cortana', versionLabel(), `Platform: ${props.platform}`].join('\n')
  )
  const { copied, copyError, copy } = useClipboardCopy(versionInfo)

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open: boolean) => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent class="m7-about-dialog">
        <DialogHeader>
          <DialogTitle>About Cortana</DialogTitle>
          <DialogDescription>
            Cortana evidence workspace for people and AI agents.
          </DialogDescription>
        </DialogHeader>
        <div class="m7-about-dialog__identity">
          <img src="/app-icon.svg" alt="" width={64} height={64} aria-hidden="true" />
          <strong>Cortana</strong>
          <span>{versionLabel()}</span>
          <small>Copyright © 2026 Cortana contributors</small>
        </div>
        <div class="m7-about-dialog__actions">
          <Button variant="outline" size="sm" type="button" onClick={() => void copy()}>
            {copied() ? 'Copied' : 'Copy version info'}
          </Button>
          <a
            href={SOURCE_URL}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => {
              if (!props.desktopAvailable) return
              event.preventDefault()
              void openDesktopUrl(SOURCE_URL)
            }}
          >
            <ExternalLink aria-hidden="true" />
            View source
          </a>
        </div>
        <Show when={copyError()}>
          <p class="m7-about-dialog__error" role="alert">
            {copyError()}
          </p>
        </Show>
      </DialogContent>
    </Dialog>
  )
}

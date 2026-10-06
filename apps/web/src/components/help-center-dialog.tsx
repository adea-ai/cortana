import {
  HelpCenter,
  type HelpLink,
  type HelpShortcut,
} from '@adea-ai/ui/components/composites/help-center'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@adea-ai/ui/components/ui/dialog'
import { createMemo } from 'solid-js'

import { shortcutLabel } from '../shortcuts'

export type HelpCenterDialogProps = {
  appName?: string
  /** Hands project links to the system browser on desktop shells. */
  openExternal?: (url: string) => Promise<void>
  onClose: () => void
  open: boolean
}

/** The keyboard shortcuts the workspace shell actually binds. */
function workspaceShortcuts(): readonly HelpShortcut[] {
  return [
    { label: 'Focus the search bar', keys: [shortcutLabel('MOD'), 'K'] },
    { label: 'Toggle the command palette', keys: [shortcutLabel('MOD'), 'P'] },
    { label: 'Open the document filter', keys: [shortcutLabel('MOD'), '⇧', 'F'] },
    { label: 'Close panels and the palette', keys: ['Esc'] },
  ]
}

const PROJECT_LINKS: readonly HelpLink[] = [
  {
    label: 'GitHub project',
    description: 'Source, releases, and issues.',
    url: 'https://github.com/adea-ai/cortana',
  },
  {
    label: 'Documentation',
    description: 'Architecture, ingestion, query, and operations guides.',
    url: 'https://github.com/adea-ai/cortana/tree/main/docs',
  },
  {
    label: 'Release notes',
    description: 'What changed in every shipped version.',
    url: 'https://github.com/adea-ai/cortana/releases',
  },
]

/**
 * The account menu's Help Center destination: the shared help page (real
 * keyboard shortcuts plus the project's resources) in a compact dialog sized
 * to its cards — not a full utility view.
 */
export function HelpCenterDialog(props: HelpCenterDialogProps) {
  const appName = () => props.appName ?? 'Cortana'
  const shortcuts = createMemo(workspaceShortcuts)
  return (
    <Dialog
      open={props.open}
      onOpenChange={(next) => {
        if (!next) props.onClose()
      }}
    >
      <DialogContent
        class="max-w-md"
        aria-label="Help Center"
        onKeyDown={(event: KeyboardEvent) => {
          // Link help tooltips cannot trap Escape in this popup.
          if (event.key === 'Escape' && !event.defaultPrevented) {
            event.preventDefault()
            props.onClose()
          }
        }}
      >
        <div class="flex flex-col gap-1">
          <DialogTitle>Help Center</DialogTitle>
          <DialogDescription>Keyboard shortcuts and resources for {appName()}.</DialogDescription>
        </div>
        <HelpCenter
          appName={appName()}
          shortcuts={shortcuts()}
          links={PROJECT_LINKS}
          showHeader={false}
          openExternal={props.openExternal}
        />
      </DialogContent>
    </Dialog>
  )
}

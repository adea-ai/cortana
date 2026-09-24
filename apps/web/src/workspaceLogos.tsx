import { createMemo, createSignal, onCleanup, onMount, Show } from 'solid-js'

import { cn } from '@/lib/utils'

import type { WorkspaceSettings } from './types'
import { LOGO_EVENT, readWorkspaceLogo } from './workspaceLogoStore'

export function WorkspaceLogo(props: {
  workspace: Pick<WorkspaceSettings, 'id' | 'name' | 'color'>
  size?: 'small' | 'medium' | 'large'
}) {
  // Re-reads on both axes: the stored logo for this workspace changes
  // (upload/removal), and the rendered workspace changes when the shell
  // switches scope. Capturing the id once left the switcher showing the
  // previous workspace's logo.
  const [version, setVersion] = createSignal(0)
  const logo = createMemo(() => {
    version()
    return readWorkspaceLogo(props.workspace.id)
  })
  const size = () => props.size ?? 'medium'

  onMount(() => {
    const refresh = () => setVersion((current) => current + 1)
    refresh()
    window.addEventListener(LOGO_EVENT, refresh)
    onCleanup(() => window.removeEventListener(LOGO_EVENT, refresh))
  })

  return (
    <Show
      when={logo()}
      fallback={
        <span
          class={cn(
            `workspace-logo workspace-logo--${size()}`,
            size() === 'small' && 'workspace-picker-mark'
          )}
          aria-hidden="true"
        >
          {(props.workspace.name.trim()[0] || '?').toUpperCase()}
        </span>
      }
    >
      {(source) => (
        <img
          class={cn(
            `workspace-logo workspace-logo--${size()}`,
            size() === 'small' && 'workspace-picker-mark'
          )}
          src={source()}
          alt=""
          aria-hidden="true"
        />
      )}
    </Show>
  )
}

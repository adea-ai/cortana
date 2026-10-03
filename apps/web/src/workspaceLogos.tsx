import { EntityIcon } from '@adea-ai/ui/components/ui/entity-icon'
import { createMemo, createSignal, onCleanup, onMount } from 'solid-js'

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
  const size = () => (({ small: 'xs', medium: 'md', large: 'xl' }) as const)[props.size ?? 'medium']

  onMount(() => {
    // Captures the component's setVersion; hoisting past onMount would lose it.
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const refresh = () => setVersion((current) => current + 1)
    refresh()
    window.addEventListener(LOGO_EVENT, refresh)
    onCleanup(() => window.removeEventListener(LOGO_EVENT, refresh))
  })

  return (
    <EntityIcon
      data-workspace-logo=""
      name={props.workspace.name.trim() || '?'}
      src={logo() ?? undefined}
      size={size()}
      aria-hidden="true"
    />
  )
}

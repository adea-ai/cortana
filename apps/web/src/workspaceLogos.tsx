import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'

import type { WorkspaceSettings } from './types'
import { LOGO_EVENT, readWorkspaceLogo } from './workspaceLogoStore'

export function WorkspaceLogo({
  workspace,
  size = 'medium',
}: {
  workspace: Pick<WorkspaceSettings, 'id' | 'name' | 'color'>
  size?: 'small' | 'medium' | 'large'
}) {
  const [logo, setLogo] = useState(() => readWorkspaceLogo(workspace.id))

  useEffect(() => {
    const refresh = () => setLogo(readWorkspaceLogo(workspace.id))
    refresh()
    window.addEventListener(LOGO_EVENT, refresh)
    return () => window.removeEventListener(LOGO_EVENT, refresh)
  }, [workspace.id])

  if (logo) {
    return (
      <img
        className={cn(
          `workspace-logo workspace-logo--${size}`,
          size === 'small' && 'workspace-picker-mark'
        )}
        src={logo}
        alt=""
        aria-hidden="true"
      />
    )
  }

  return (
    <span
      className={cn(
        `workspace-logo workspace-logo--${size}`,
        size === 'small' && 'workspace-picker-mark'
      )}
      aria-hidden="true"
    >
      {(workspace.name.trim()[0] || '?').toUpperCase()}
    </span>
  )
}

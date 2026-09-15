import { CircleAlert, CircleCheck, CircleX, CloudOff, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'

import { Badge } from '@/components/shadcn/badge'
import { cn } from '@/lib/utils'

export type StatusTone = 'success' | 'warning' | 'error' | 'offline' | 'busy'

const statusIcons = {
  success: CircleCheck,
  warning: CircleAlert,
  error: CircleX,
  offline: CloudOff,
  busy: LoaderCircle,
} satisfies Record<StatusTone, typeof CircleCheck>

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const Icon = statusIcons[tone]

  return (
    <Badge
      variant="outline"
      className={cn(
        tone === 'success' && 'border-success/40 bg-success/10 text-success',
        tone === 'warning' && 'border-warning/40 bg-warning/10 text-warning',
        tone === 'error' && 'border-destructive/40 bg-destructive/10 text-destructive',
        tone === 'offline' && 'border-muted-foreground/40 bg-muted text-muted-foreground',
        tone === 'busy' && 'border-primary/40 bg-primary/10 text-primary'
      )}
      role="status"
      aria-busy={tone === 'busy' ? true : undefined}
    >
      <Icon data-icon="inline-start" className={cn(tone === 'busy' && 'animate-spin')} />
      {children}
    </Badge>
  )
}

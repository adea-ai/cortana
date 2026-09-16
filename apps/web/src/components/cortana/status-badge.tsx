import { CircleAlert, CircleCheck, CircleX, CloudOff, LoaderCircle } from 'lucide-solid'
import type { JSX } from 'solid-js'
import { Dynamic } from 'solid-js/web'

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

export function StatusBadge(props: { tone: StatusTone; children: JSX.Element }) {
  return (
    <Badge
      variant="outline"
      class={cn(
        props.tone === 'success' && 'border-success/40 bg-success/10 text-success',
        props.tone === 'warning' && 'border-warning/40 bg-warning/10 text-warning',
        props.tone === 'error' && 'border-destructive/40 bg-destructive/10 text-destructive',
        props.tone === 'offline' && 'border-muted-foreground/40 bg-muted text-muted-foreground',
        props.tone === 'busy' && 'border-primary/40 bg-primary/10 text-primary'
      )}
      role="status"
      aria-busy={props.tone === 'busy' ? true : undefined}
    >
      <Dynamic
        component={statusIcons[props.tone]}
        data-icon="inline-start"
        class={cn(props.tone === 'busy' && 'animate-spin')}
      />
      {props.children}
    </Badge>
  )
}

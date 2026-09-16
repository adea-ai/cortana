import { Progress as ProgressPrimitive } from '@kobalte/core/progress'
import { splitProps, type ComponentProps } from 'solid-js'

import { cn } from '@/lib/utils'

function Progress(
  props: ComponentProps<typeof ProgressPrimitive> & {
    value?: number | null
  }
) {
  const [local, rest] = splitProps(props, ['class', 'children', 'value'])
  return (
    <ProgressPrimitive
      data-slot="progress"
      value={local.value ?? undefined}
      indeterminate={local.value == null}
      class={cn('relative flex w-full flex-col gap-2', local.class)}
      {...rest}
    >
      {local.children}
      <ProgressPrimitive.Track
        data-slot="progress-track"
        class="relative h-1 w-full overflow-hidden rounded-full bg-muted"
      >
        <ProgressPrimitive.Fill
          data-slot="progress-indicator"
          class="h-full w-(--kb-progress-fill-width) flex-1 bg-primary transition-all data-[progress=loading]:animate-pulse"
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive>
  )
}

function ProgressLabel(props: ComponentProps<typeof ProgressPrimitive.Label>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <ProgressPrimitive.Label
      data-slot="progress-label"
      class={cn('text-sm font-medium', local.class)}
      {...rest}
    />
  )
}

function ProgressValue(props: ComponentProps<typeof ProgressPrimitive.ValueLabel>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <ProgressPrimitive.ValueLabel
      data-slot="progress-value"
      class={cn('ml-auto text-sm text-muted-foreground tabular-nums', local.class)}
      {...rest}
    />
  )
}

export { Progress, ProgressLabel, ProgressValue }

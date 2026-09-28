import { Show, splitProps, type ComponentProps } from 'solid-js'

import { Button } from '@/components/shadcn/button'
import { Spinner } from '@adea-ai/ui/components/ui/spinner'

export function AsyncButton(
  props: ComponentProps<typeof Button> & { busy?: boolean; busyLabel?: string }
) {
  const [local, rest] = splitProps(props, ['busy', 'busyLabel', 'children', 'disabled'])
  const busy = () => local.busy ?? false
  return (
    <Button
      aria-busy={busy() || undefined}
      // Named explicitly while busy: the shared spinner ships its own visually
      // hidden "Loading" label, which would otherwise pollute the name.
      aria-label={busy() ? (local.busyLabel ?? 'Working') : undefined}
      disabled={busy() || local.disabled}
      {...rest}
    >
      <Show when={busy()}>
        <Spinner data-icon="inline-start" role="presentation" aria-hidden="true" />
      </Show>
      <Show when={busy()} fallback={local.children}>
        {local.busyLabel ?? 'Working'}
      </Show>
    </Button>
  )
}

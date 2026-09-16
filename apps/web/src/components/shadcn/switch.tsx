import { Switch as SwitchPrimitive } from '@kobalte/core/switch'
import { splitProps, type ComponentProps, type JSX } from 'solid-js'

import { cn } from '@/lib/utils'

function Switch(
  props: ComponentProps<typeof SwitchPrimitive> & {
    size?: 'sm' | 'default'
  }
) {
  const [local, rest] = splitProps(props, [
    'class',
    'size',
    'children',
    'aria-label',
    'aria-labelledby',
    'aria-describedby',
    'aria-busy',
    'aria-invalid',
    'title',
  ])
  return (
    <SwitchPrimitive class="peer inline-flex items-center" {...rest}>
      <SwitchPrimitive.Input
        class="sr-only"
        aria-label={local['aria-label']}
        aria-labelledby={local['aria-labelledby']}
        aria-describedby={local['aria-describedby']}
        aria-busy={local['aria-busy']}
        aria-invalid={local['aria-invalid']}
        title={local.title}
      />
      <SwitchPrimitive.Control
        data-slot="switch"
        data-size={local.size ?? 'default'}
        class={cn(
          'group/switch relative inline-flex shrink-0 items-center rounded-full border border-transparent transition-all outline-none group-has-[:focus-visible]/field-label:border-transparent group-has-[:focus-visible]/field-label:ring-0 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=default]:h-[18.4px] data-[size=default]:w-[32px] data-[size=sm]:h-[14px] data-[size=sm]:w-[24px] dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:bg-primary not-data-checked:bg-input dark:not-data-checked:bg-input/80 data-disabled:cursor-not-allowed data-disabled:opacity-50',
          local.class
        )}
      >
        <SwitchPrimitive.Thumb
          data-slot="switch-thumb"
          class="pointer-events-none block rounded-full bg-background ring-0 transition-transform group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 group-data-[size=default]/switch:data-checked:translate-x-[calc(100%-2px)] group-data-[size=sm]/switch:data-checked:translate-x-[calc(100%-2px)] dark:data-checked:bg-primary-foreground group-data-[size=default]/switch:not-data-checked:translate-x-0 group-data-[size=sm]/switch:not-data-checked:translate-x-0 dark:not-data-checked:bg-foreground"
        />
      </SwitchPrimitive.Control>
      {local.children as JSX.Element}
    </SwitchPrimitive>
  )
}

export { Switch }

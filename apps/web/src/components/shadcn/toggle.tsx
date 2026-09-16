import { ToggleButton as TogglePrimitive } from '@kobalte/core/toggle-button'
import { splitProps, type ComponentProps } from 'solid-js'
import type { VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'
import { toggleVariants } from './toggle-variants'

function Toggle(
  props: ComponentProps<typeof TogglePrimitive> & VariantProps<typeof toggleVariants>
) {
  const [local, rest] = splitProps(props, ['class', 'variant', 'size'])
  return (
    <TogglePrimitive
      data-slot="toggle"
      class={cn(toggleVariants({ variant: local.variant, size: local.size }), local.class)}
      {...rest}
    />
  )
}

export { Toggle }

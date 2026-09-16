import { Button as ButtonPrimitive } from '@kobalte/core/button'
import { splitProps, type ComponentProps } from 'solid-js'
import type { VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'
import { buttonVariants } from './button-variants'

function Button(
  props: ComponentProps<typeof ButtonPrimitive> & VariantProps<typeof buttonVariants>
) {
  const [local, rest] = splitProps(props, ['class', 'variant', 'size'])
  return (
    <ButtonPrimitive
      data-slot="button"
      class={cn(buttonVariants({ variant: local.variant, size: local.size }), local.class)}
      {...rest}
    />
  )
}

export { Button }

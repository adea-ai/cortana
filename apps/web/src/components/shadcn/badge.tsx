import { splitProps, type ComponentProps } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import type { VariantProps } from 'class-variance-authority'
import type { ValidComponent } from 'solid-js'

import { cn } from '@/lib/utils'
import { badgeVariants } from './badge-variants'

type BadgeProps = ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & {
    /** Render the badge as another component or element (polymorphic). */
    as?: ValidComponent
  }

function Badge(props: BadgeProps) {
  const [local, rest] = splitProps(props, ['class', 'variant', 'as'])
  return (
    <Dynamic
      component={local.as ?? 'span'}
      data-slot="badge"
      data-variant={local.variant}
      class={cn(badgeVariants({ variant: local.variant }), local.class)}
      {...rest}
    />
  )
}

export { Badge }

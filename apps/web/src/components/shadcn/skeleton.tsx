import { Skeleton as SkeletonPrimitive } from '@kobalte/core/skeleton'
import { splitProps, type ComponentProps } from 'solid-js'

import { cn } from '@/lib/utils'

function Skeleton(props: ComponentProps<typeof SkeletonPrimitive>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <SkeletonPrimitive
      data-slot="skeleton"
      class={cn('animate-pulse rounded-md bg-muted', local.class)}
      {...rest}
    />
  )
}

export { Skeleton }

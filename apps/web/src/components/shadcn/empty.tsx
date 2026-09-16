import { splitProps, type ComponentProps } from 'solid-js'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

function Empty(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <div
      data-slot="empty"
      class={cn(
        'flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-4 rounded-xl border-dashed p-6 text-center text-balance',
        local.class
      )}
      {...rest}
    />
  )
}

function EmptyHeader(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <div
      data-slot="empty-header"
      class={cn('flex max-w-sm flex-col items-center gap-2', local.class)}
      {...rest}
    />
  )
}

const emptyMediaVariants = cva(
  'mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        icon: "flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

function EmptyMedia(props: ComponentProps<'div'> & VariantProps<typeof emptyMediaVariants>) {
  const [local, rest] = splitProps(props, ['class', 'variant'])
  return (
    <div
      data-slot="empty-icon"
      data-variant={local.variant ?? 'default'}
      class={cn(emptyMediaVariants({ variant: local.variant }), local.class)}
      {...rest}
    />
  )
}

function EmptyTitle(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <div
      data-slot="empty-title"
      class={cn('font-heading text-sm font-medium tracking-tight', local.class)}
      {...rest}
    />
  )
}

function EmptyDescription(props: ComponentProps<'p'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <div
      data-slot="empty-description"
      class={cn(
        'text-sm/relaxed text-muted-foreground [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary',
        local.class
      )}
      {...rest}
    />
  )
}

function EmptyContent(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <div
      data-slot="empty-content"
      class={cn(
        'flex w-full max-w-sm min-w-0 flex-col items-center gap-2.5 text-sm text-balance',
        local.class
      )}
      {...rest}
    />
  )
}

export { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent, EmptyMedia }

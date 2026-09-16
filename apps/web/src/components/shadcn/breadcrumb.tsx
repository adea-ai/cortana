import { Show, splitProps, type ComponentProps } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import type { ValidComponent } from 'solid-js'

import { cn } from '@/lib/utils'
import { ChevronRightIcon, MoreHorizontalIcon } from 'lucide-solid'

function Breadcrumb(props: ComponentProps<'nav'>) {
  const [local, rest] = splitProps(props, ['class'])
  return <nav aria-label="breadcrumb" data-slot="breadcrumb" class={cn(local.class)} {...rest} />
}

function BreadcrumbList(props: ComponentProps<'ol'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <ol
      data-slot="breadcrumb-list"
      class={cn(
        'flex flex-wrap items-center gap-1.5 text-sm wrap-break-word text-muted-foreground',
        local.class
      )}
      {...rest}
    />
  )
}

function BreadcrumbItem(props: ComponentProps<'li'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <li
      data-slot="breadcrumb-item"
      class={cn('inline-flex items-center gap-1', local.class)}
      {...rest}
    />
  )
}

function BreadcrumbLink(props: ComponentProps<'a'> & { as?: ValidComponent }) {
  const [local, rest] = splitProps(props, ['class', 'as'])
  return (
    <Dynamic
      component={local.as ?? 'a'}
      data-slot="breadcrumb-link"
      class={cn('transition-colors hover:text-foreground', local.class)}
      {...rest}
    />
  )
}

function BreadcrumbPage(props: ComponentProps<'span'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <span
      data-slot="breadcrumb-page"
      role="link"
      aria-disabled="true"
      aria-current="page"
      class={cn('font-normal text-foreground', local.class)}
      {...rest}
    />
  )
}

function BreadcrumbSeparator(props: ComponentProps<'li'>) {
  const [local, rest] = splitProps(props, ['children', 'class'])
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      class={cn('[&>svg]:size-3.5', local.class)}
      {...rest}
    >
      <Show when={local.children} fallback={<ChevronRightIcon />}>
        {local.children}
      </Show>
    </li>
  )
}

function BreadcrumbEllipsis(props: ComponentProps<'span'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <span
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      aria-hidden="true"
      class={cn('flex size-5 items-center justify-center [&>svg]:size-4', local.class)}
      {...rest}
    >
      <MoreHorizontalIcon />
      <span class="sr-only">More</span>
    </span>
  )
}

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
}

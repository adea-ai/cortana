import { splitProps, type ComponentProps } from 'solid-js'
import { type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/shadcn/button-variants'
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from 'lucide-solid'

function Pagination(props: ComponentProps<'nav'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <nav
      role="navigation"
      aria-label="pagination"
      data-slot="pagination"
      class={cn('mx-auto flex w-full justify-center', local.class)}
      {...rest}
    />
  )
}

function PaginationContent(props: ComponentProps<'ul'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <ul
      data-slot="pagination-content"
      class={cn('flex items-center gap-0.5', local.class)}
      {...rest}
    />
  )
}

function PaginationItem(props: ComponentProps<'li'>) {
  return <li data-slot="pagination-item" {...props} />
}

type PaginationLinkProps = {
  isActive?: boolean
} & Pick<VariantProps<typeof buttonVariants>, 'size'> &
  ComponentProps<'a'>

function PaginationLink(props: PaginationLinkProps) {
  const [local, rest] = splitProps(props, ['class', 'isActive', 'size'])
  return (
    <a
      aria-current={local.isActive ? 'page' : undefined}
      data-slot="pagination-link"
      data-active={local.isActive}
      class={cn(
        buttonVariants({ variant: local.isActive ? 'outline' : 'ghost', size: local.size }),
        local.class
      )}
      {...rest}
    />
  )
}

function PaginationNext(props: ComponentProps<typeof PaginationLink> & { text?: string }) {
  const [local, rest] = splitProps(props, ['class', 'text', 'children'])
  return (
    <PaginationLink
      aria-label="Go to next page"
      size="default"
      class={cn('pr-1.5!', local.class)}
      {...rest}
    >
      <span class="hidden sm:block">{local.text ?? 'Next'}</span>
      <ChevronRightIcon data-icon="inline-end" />
    </PaginationLink>
  )
}

function PaginationPrevious(props: ComponentProps<typeof PaginationLink> & { text?: string }) {
  const [local, rest] = splitProps(props, ['class', 'text'])
  return (
    <PaginationLink
      aria-label="Go to previous page"
      size="default"
      class={cn('pl-1.5!', local.class)}
      {...rest}
    >
      <ChevronLeftIcon data-icon="inline-start" />
      <span class="hidden sm:block">{local.text ?? 'Previous'}</span>
    </PaginationLink>
  )
}

function PaginationEllipsis(props: ComponentProps<'span'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      class={cn(
        "flex size-8 items-center justify-center [&_svg:not([class*='size-'])]:size-4",
        local.class
      )}
      {...rest}
    >
      <MoreHorizontalIcon />
      <span class="sr-only">More pages</span>
    </span>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
}

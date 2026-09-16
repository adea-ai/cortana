import * as SheetPrimitive from '@kobalte/core/dialog'
import { Show, splitProps, type ComponentProps } from 'solid-js'

import { cn } from '@/lib/utils'
import { Button } from '@/components/shadcn/button'
import { XIcon } from 'lucide-solid'

function Sheet(props: ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger(props: ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose(props: ComponentProps<typeof SheetPrimitive.CloseButton>) {
  return <SheetPrimitive.CloseButton data-slot="sheet-close" {...props} />
}

function SheetPortal(props: ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay(props: ComponentProps<typeof SheetPrimitive.Overlay>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      class={cn(
        'fixed inset-0 z-50 bg-overlay transition-opacity duration-150 data-closed:opacity-0 data-expanded:opacity-100 supports-backdrop-filter:backdrop-blur-xs',
        local.class
      )}
      {...rest}
    />
  )
}

function SheetContent(
  props: ComponentProps<typeof SheetPrimitive.Content> & {
    side?: 'top' | 'right' | 'bottom' | 'left'
    showCloseButton?: boolean
    finalFocus?: { current: HTMLElement | null } | null
  }
) {
  const [local, rest] = splitProps(props, [
    'class',
    'children',
    'side',
    'showCloseButton',
    'finalFocus',
    'onCloseAutoFocus',
    'ref',
  ])
  const side = () => local.side ?? 'right'
  // Kobalte restores focus to the SheetTrigger element on close; sheets opened
  // programmatically have no trigger, so capture the focused element when the
  // portaled content actually mounts (before autofocus runs) and restore to it.
  let previouslyFocused: HTMLElement | null = null
  const handleCloseAutoFocus = (event: Event) => {
    local.onCloseAutoFocus?.(event)
    const target = local.finalFocus?.current ?? previouslyFocused
    if (!event.defaultPrevented && target?.isConnected) {
      event.preventDefault()
      target.focus()
    }
  }
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        ref={(el) => {
          previouslyFocused =
            document.activeElement instanceof HTMLElement ? document.activeElement : null
          if (typeof local.ref === 'function') local.ref(el)
        }}
        onCloseAutoFocus={handleCloseAutoFocus}
        data-side={side()}
        class={cn(
          'fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-closed:opacity-0 data-expanded:opacity-100 data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=bottom]:data-closed:translate-y-[2.5rem] data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:data-closed:translate-x-[-2.5rem] data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=right]:data-closed:translate-x-[2.5rem] data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=top]:data-closed:translate-y-[-2.5rem] data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm',
          local.class
        )}
        {...rest}
      >
        {local.children}
        <Show when={local.showCloseButton ?? true}>
          <SheetPrimitive.CloseButton
            data-slot="sheet-close"
            as={Button}
            variant="ghost"
            class="absolute top-3 right-3"
            size="icon-sm"
            aria-label="Close"
          >
            <XIcon />
            <span class="sr-only">Close</span>
          </SheetPrimitive.CloseButton>
        </Show>
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <div data-slot="sheet-header" class={cn('flex flex-col gap-0.5 p-4', local.class)} {...rest} />
  )
}

function SheetFooter(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <div
      data-slot="sheet-footer"
      class={cn('mt-auto flex flex-col gap-2 p-4', local.class)}
      {...rest}
    />
  )
}

function SheetTitle(props: ComponentProps<typeof SheetPrimitive.Title>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      class={cn('font-heading text-base font-medium text-foreground', local.class)}
      {...rest}
    />
  )
}

function SheetDescription(props: ComponentProps<typeof SheetPrimitive.Description>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      class={cn('text-sm text-muted-foreground', local.class)}
      {...rest}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}

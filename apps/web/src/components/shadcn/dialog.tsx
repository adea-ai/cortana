import * as DialogPrimitive from '@kobalte/core/dialog'
import { Show, splitProps, type ComponentProps } from 'solid-js'

import { cn } from '@/lib/utils'
import { Button } from '@/components/shadcn/button'
import { XIcon } from 'lucide-solid'

function Dialog(props: ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger(props: ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal(props: ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose(props: ComponentProps<typeof DialogPrimitive.CloseButton>) {
  return <DialogPrimitive.CloseButton data-slot="dialog-close" {...props} />
}

function DialogOverlay(props: ComponentProps<typeof DialogPrimitive.Overlay>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      class={cn(
        'fixed inset-0 isolate z-50 bg-overlay duration-100 supports-backdrop-filter:backdrop-blur-xs data-expanded:animate-in data-expanded:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
        local.class
      )}
      {...rest}
    />
  )
}

function DialogContent(
  props: ComponentProps<typeof DialogPrimitive.Content> & {
    showCloseButton?: boolean
    finalFocus?: { current: HTMLElement | null } | null
  }
) {
  const [local, rest] = splitProps(props, [
    'class',
    'children',
    'showCloseButton',
    'finalFocus',
    'onCloseAutoFocus',
    'ref',
  ])
  // Kobalte restores focus to the DialogTrigger element on close; dialogs
  // opened programmatically have no trigger, so capture the focused element
  // when the portaled content actually mounts (before autofocus runs) and
  // restore to it.
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
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        ref={(el) => {
          previouslyFocused =
            document.activeElement instanceof HTMLElement ? document.activeElement : null
          if (typeof local.ref === 'function') local.ref(el)
        }}
        onCloseAutoFocus={handleCloseAutoFocus}
        class={cn(
          'fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-expanded:animate-in data-expanded:fade-in-0 data-expanded:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
          local.class
        )}
        {...rest}
      >
        {local.children}
        <Show when={local.showCloseButton ?? true}>
          <DialogPrimitive.CloseButton
            data-slot="dialog-close"
            as={Button}
            variant="ghost"
            class="absolute top-2 right-2"
            size="icon-sm"
            aria-label="Close"
          >
            <XIcon />
            <span class="sr-only">Close</span>
          </DialogPrimitive.CloseButton>
        </Show>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class'])
  return <div data-slot="dialog-header" class={cn('flex flex-col gap-2', local.class)} {...rest} />
}

function DialogFooter(
  props: ComponentProps<'div'> & {
    showCloseButton?: boolean
  }
) {
  const [local, rest] = splitProps(props, ['class', 'showCloseButton', 'children'])
  return (
    <div
      data-slot="dialog-footer"
      class={cn(
        '-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end',
        local.class
      )}
      {...rest}
    >
      {local.children}
      <Show when={local.showCloseButton}>
        <DialogPrimitive.CloseButton as={Button} variant="outline">
          Close
        </DialogPrimitive.CloseButton>
      </Show>
    </div>
  )
}

function DialogTitle(props: ComponentProps<typeof DialogPrimitive.Title>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      class={cn('font-heading text-base leading-none font-medium', local.class)}
      {...rest}
    />
  )
}

function DialogDescription(props: ComponentProps<typeof DialogPrimitive.Description>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      class={cn(
        'text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground',
        local.class
      )}
      {...rest}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}

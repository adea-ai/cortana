import * as AlertDialogPrimitive from '@kobalte/core/alert-dialog'
import { splitProps, type ComponentProps } from 'solid-js'

import { cn } from '@/lib/utils'
import { Button } from '@/components/shadcn/button'
import { buttonVariants } from '@/components/shadcn/button-variants'

function AlertDialog(props: ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

function AlertDialogTrigger(props: ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
}

function AlertDialogPortal(props: ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
}

function AlertDialogOverlay(props: ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      class={cn(
        'fixed inset-0 isolate z-50 bg-overlay duration-100 supports-backdrop-filter:backdrop-blur-xs data-expanded:animate-in data-expanded:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
        local.class
      )}
      {...rest}
    />
  )
}

function AlertDialogContent(
  props: ComponentProps<typeof AlertDialogPrimitive.Content> & {
    size?: 'default' | 'sm'
  }
) {
  const [local, rest] = splitProps(props, ['class', 'size'])
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        data-size={local.size ?? 'default'}
        class={cn(
          'group/alert-dialog-content fixed top-1/2 left-1/2 z-50 grid w-full -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-sm data-expanded:animate-in data-expanded:fade-in-0 data-expanded:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
          local.class
        )}
        {...rest}
      />
    </AlertDialogPortal>
  )
}

function AlertDialogHeader(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <div
      data-slot="alert-dialog-header"
      class={cn(
        'grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-4 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]',
        local.class
      )}
      {...rest}
    />
  )
}

function AlertDialogFooter(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <div
      data-slot="alert-dialog-footer"
      class={cn(
        '-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end',
        local.class
      )}
      {...rest}
    />
  )
}

function AlertDialogMedia(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <div
      data-slot="alert-dialog-media"
      class={cn(
        "mb-2 inline-flex size-10 items-center justify-center rounded-md bg-muted sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-6",
        local.class
      )}
      {...rest}
    />
  )
}

function AlertDialogTitle(props: ComponentProps<typeof AlertDialogPrimitive.Title>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      class={cn(
        'font-heading text-base font-medium sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2',
        local.class
      )}
      {...rest}
    />
  )
}

function AlertDialogDescription(props: ComponentProps<typeof AlertDialogPrimitive.Description>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      class={cn(
        'text-sm text-balance text-popover-foreground/80 md:text-pretty *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground',
        local.class
      )}
      {...rest}
    />
  )
}

function AlertDialogAction(props: ComponentProps<typeof Button>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Button data-slot="alert-dialog-action" class={cn(local.class)} {...rest} />
}

function AlertDialogCancel(
  props: ComponentProps<typeof AlertDialogPrimitive.CloseButton> &
    Pick<ComponentProps<typeof Button>, 'variant' | 'size'>
) {
  const [local, rest] = splitProps(props, ['class', 'variant', 'size'])
  return (
    <AlertDialogPrimitive.CloseButton
      data-slot="alert-dialog-cancel"
      class={cn(
        buttonVariants({ variant: local.variant ?? 'outline', size: local.size ?? 'default' }),
        local.class
      )}
      {...rest}
    />
  )
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
}

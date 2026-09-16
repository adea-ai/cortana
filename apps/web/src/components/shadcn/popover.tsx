import { Popover as PopoverPrimitive } from '@kobalte/core/popover'
import { splitProps, type ComponentProps } from 'solid-js'
type Placement =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-start'
  | 'top-end'
  | 'bottom-start'
  | 'bottom-end'
  | 'left-start'
  | 'left-end'
  | 'right-start'
  | 'right-end'

import { cn } from '@/lib/utils'

type Side = 'top' | 'right' | 'bottom' | 'left'
type Align = 'start' | 'center' | 'end'

function toPlacement(side: Side, align: Align): Placement {
  return align === 'start' || align === 'end' ? `${side}-${align}` : side
}

function Popover(props: ComponentProps<typeof PopoverPrimitive>) {
  return <PopoverPrimitive data-slot="popover" {...props} />
}

function PopoverTrigger(props: ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent(
  props: ComponentProps<typeof PopoverPrimitive.Content> & {
    side?: Side
    align?: Align
    sideOffset?: number
    alignOffset?: number
  }
) {
  const [local, rest] = splitProps(props, ['class', 'side', 'align', 'sideOffset', 'alignOffset'])
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        placement={toPlacement(local.side ?? 'bottom', local.align ?? 'center')}
        gutter={local.sideOffset ?? 4}
        shift={local.alignOffset}
        class={cn(
          'z-50 flex w-72 origin-(--kb-popover-content-transform-origin) flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-expanded:animate-in data-expanded:fade-in-0 data-expanded:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
          local.class
        )}
        {...rest}
      />
    </PopoverPrimitive.Portal>
  )
}

function PopoverHeader(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <div
      data-slot="popover-header"
      class={cn('flex flex-col gap-0.5 text-sm', local.class)}
      {...rest}
    />
  )
}

function PopoverTitle(props: ComponentProps<typeof PopoverPrimitive.Title>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      class={cn('font-medium', local.class)}
      {...rest}
    />
  )
}

function PopoverDescription(props: ComponentProps<typeof PopoverPrimitive.Description>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      class={cn('text-muted-foreground', local.class)}
      {...rest}
    />
  )
}

export { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger }

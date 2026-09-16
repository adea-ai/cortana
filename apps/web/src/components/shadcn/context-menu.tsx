import { ContextMenu as ContextMenuPrimitive } from '@kobalte/core/context-menu'
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
import { ChevronRightIcon, CheckIcon } from 'lucide-solid'

type Side = 'top' | 'right' | 'bottom' | 'left'
type Align = 'start' | 'center' | 'end'

function toPlacement(side: Side, align: Align): Placement {
  return align === 'start' || align === 'end' ? `${side}-${align}` : side
}

function ContextMenu(props: ComponentProps<typeof ContextMenuPrimitive>) {
  return <ContextMenuPrimitive data-slot="context-menu" {...props} />
}

function ContextMenuPortal(props: ComponentProps<typeof ContextMenuPrimitive.Portal>) {
  return <ContextMenuPrimitive.Portal data-slot="context-menu-portal" {...props} />
}

function ContextMenuTrigger(props: ComponentProps<typeof ContextMenuPrimitive.Trigger>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <ContextMenuPrimitive.Trigger
      data-slot="context-menu-trigger"
      class={cn('select-none', local.class)}
      {...rest}
    />
  )
}

function ContextMenuContent(
  props: ComponentProps<typeof ContextMenuPrimitive.Content> & {
    side?: Side
    align?: Align
    sideOffset?: number
    alignOffset?: number
  }
) {
  const [local, rest] = splitProps(props, ['class', 'side', 'align', 'sideOffset', 'alignOffset'])
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        data-slot="context-menu-content"
        placement={toPlacement(local.side ?? 'right', local.align ?? 'start')}
        gutter={local.sideOffset ?? 0}
        shift={local.alignOffset ?? 4}
        class={cn(
          'z-50 max-h-(--kb-popper-content-available-height) min-w-36 origin-(--kb-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-expanded:animate-in data-expanded:fade-in-0 data-expanded:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
          local.class
        )}
        {...rest}
      />
    </ContextMenuPrimitive.Portal>
  )
}

function ContextMenuGroup(props: ComponentProps<typeof ContextMenuPrimitive.Group>) {
  return <ContextMenuPrimitive.Group data-slot="context-menu-group" {...props} />
}

function ContextMenuLabel(
  props: ComponentProps<typeof ContextMenuPrimitive.GroupLabel> & {
    inset?: boolean
  }
) {
  const [local, rest] = splitProps(props, ['class', 'inset'])
  return (
    <ContextMenuPrimitive.GroupLabel
      data-slot="context-menu-label"
      data-inset={local.inset || undefined}
      class={cn(
        'px-1.5 py-1 text-xs font-medium text-muted-foreground data-[inset]:pl-7',
        local.class
      )}
      {...rest}
    />
  )
}

function ContextMenuItem(
  props: ComponentProps<typeof ContextMenuPrimitive.Item> & {
    inset?: boolean
    variant?: 'default' | 'destructive'
  }
) {
  const [local, rest] = splitProps(props, ['class', 'inset', 'variant'])
  return (
    <ContextMenuPrimitive.Item
      data-slot="context-menu-item"
      data-inset={local.inset || undefined}
      data-variant={local.variant ?? 'default'}
      class={cn(
        "group/context-menu-item relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[inset]:pl-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:data-highlighted:bg-destructive/10 data-[variant=destructive]:data-highlighted:text-destructive dark:data-[variant=destructive]:data-highlighted:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-highlighted:*:[svg]:text-accent-foreground data-[variant=destructive]:*:[svg]:text-destructive",
        local.class
      )}
      {...rest}
    />
  )
}

function ContextMenuSub(props: ComponentProps<typeof ContextMenuPrimitive.Sub>) {
  return <ContextMenuPrimitive.Sub data-slot="context-menu-sub" {...props} />
}

function ContextMenuSubTrigger(
  props: ComponentProps<typeof ContextMenuPrimitive.SubTrigger> & {
    inset?: boolean
  }
) {
  const [local, rest] = splitProps(props, ['class', 'inset', 'children'])
  return (
    <ContextMenuPrimitive.SubTrigger
      data-slot="context-menu-sub-trigger"
      data-inset={local.inset || undefined}
      class={cn(
        "flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[inset]:pl-7 data-expanded:bg-accent data-expanded:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        local.class
      )}
      {...rest}
    >
      {local.children}
      <ChevronRightIcon class="ml-auto" />
    </ContextMenuPrimitive.SubTrigger>
  )
}

function ContextMenuSubContent(props: ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.SubContent
        data-slot="context-menu-sub-content"
        placement="right-start"
        class={cn(
          'z-50 max-h-(--kb-popper-content-available-height) min-w-36 origin-(--kb-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 outline-none data-expanded:animate-in data-expanded:fade-in-0 data-expanded:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
          local.class
        )}
        {...rest}
      />
    </ContextMenuPrimitive.Portal>
  )
}

function ContextMenuCheckboxItem(
  props: ComponentProps<typeof ContextMenuPrimitive.CheckboxItem> & {
    inset?: boolean
  }
) {
  const [local, rest] = splitProps(props, ['class', 'children', 'inset'])
  return (
    <ContextMenuPrimitive.CheckboxItem
      data-slot="context-menu-checkbox-item"
      data-inset={local.inset || undefined}
      class={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[inset]:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        local.class
      )}
      {...rest}
    >
      <span class="pointer-events-none absolute right-2">
        <ContextMenuPrimitive.ItemIndicator>
          <CheckIcon />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {local.children}
    </ContextMenuPrimitive.CheckboxItem>
  )
}

function ContextMenuRadioGroup(props: ComponentProps<typeof ContextMenuPrimitive.RadioGroup>) {
  return <ContextMenuPrimitive.RadioGroup data-slot="context-menu-radio-group" {...props} />
}

function ContextMenuRadioItem(
  props: ComponentProps<typeof ContextMenuPrimitive.RadioItem> & {
    inset?: boolean
  }
) {
  const [local, rest] = splitProps(props, ['class', 'children', 'inset'])
  return (
    <ContextMenuPrimitive.RadioItem
      data-slot="context-menu-radio-item"
      data-inset={local.inset || undefined}
      class={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[inset]:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        local.class
      )}
      {...rest}
    >
      <span class="pointer-events-none absolute right-2">
        <ContextMenuPrimitive.ItemIndicator>
          <CheckIcon />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {local.children}
    </ContextMenuPrimitive.RadioItem>
  )
}

function ContextMenuSeparator(props: ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <ContextMenuPrimitive.Separator
      data-slot="context-menu-separator"
      class={cn('-mx-1 my-1 h-px bg-border', local.class)}
      {...rest}
    />
  )
}

function ContextMenuShortcut(props: ComponentProps<'span'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <span
      data-slot="context-menu-shortcut"
      class={cn(
        'ml-auto text-xs tracking-widest text-muted-foreground group-data-highlighted/context-menu-item:text-accent-foreground',
        local.class
      )}
      {...rest}
    />
  )
}

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
}

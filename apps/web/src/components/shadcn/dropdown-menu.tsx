import { DropdownMenu as MenuPrimitive } from '@kobalte/core/dropdown-menu'
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

function DropdownMenu(props: ComponentProps<typeof MenuPrimitive>) {
  // Menus are non-modal surfaces per the ARIA APG: Kobalte's modal mode would
  // aria-hide the rest of the document, inject focus guards inside role=menu,
  // and lock outside pointer events, none of which a dropdown menu needs.
  const [local, rest] = splitProps(props, ['modal'])
  return <MenuPrimitive data-slot="dropdown-menu" modal={local.modal ?? false} {...rest} />
}

function DropdownMenuPortal(props: ComponentProps<typeof MenuPrimitive.Portal>) {
  return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
}

function DropdownMenuTrigger(props: ComponentProps<typeof MenuPrimitive.Trigger>) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

function DropdownMenuContent(
  props: ComponentProps<typeof MenuPrimitive.Content> & {
    side?: Side
    align?: Align
    sideOffset?: number
    alignOffset?: number
  }
) {
  const [local, rest] = splitProps(props, ['class', 'side', 'align', 'sideOffset', 'alignOffset'])
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        data-slot="dropdown-menu-content"
        placement={toPlacement(local.side ?? 'bottom', local.align ?? 'start')}
        gutter={local.sideOffset ?? 4}
        shift={local.alignOffset}
        class={cn(
          'z-50 max-h-(--kb-popper-content-available-height) w-(--kb-popper-anchor-width) min-w-32 origin-(--kb-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-expanded:animate-in data-expanded:fade-in-0 data-expanded:zoom-in-95 data-closed:animate-out data-closed:overflow-hidden data-closed:fade-out-0 data-closed:zoom-out-95',
          local.class
        )}
        {...rest}
      />
    </MenuPrimitive.Portal>
  )
}

function DropdownMenuGroup(props: ComponentProps<typeof MenuPrimitive.Group>) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
}

function DropdownMenuLabel(
  props: ComponentProps<typeof MenuPrimitive.GroupLabel> & {
    inset?: boolean
  }
) {
  const [local, rest] = splitProps(props, ['class', 'inset'])
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      data-inset={local.inset || undefined}
      class={cn(
        'px-1.5 py-1 text-xs font-medium text-muted-foreground data-[inset]:pl-7',
        local.class
      )}
      {...rest}
    />
  )
}

function DropdownMenuItem(
  props: ComponentProps<typeof MenuPrimitive.Item> & {
    inset?: boolean
    variant?: 'default' | 'destructive'
  }
) {
  const [local, rest] = splitProps(props, ['class', 'inset', 'variant'])
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={local.inset || undefined}
      data-variant={local.variant ?? 'default'}
      class={cn(
        "group/dropdown-menu-item relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground data-[inset]:pl-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:data-highlighted:bg-destructive/10 data-[variant=destructive]:data-highlighted:text-destructive dark:data-[variant=destructive]:data-highlighted:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive",
        local.class
      )}
      {...rest}
    />
  )
}

function DropdownMenuSub(props: ComponentProps<typeof MenuPrimitive.Sub>) {
  return <MenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />
}

function DropdownMenuSubTrigger(
  props: ComponentProps<typeof MenuPrimitive.SubTrigger> & {
    inset?: boolean
  }
) {
  const [local, rest] = splitProps(props, ['class', 'inset', 'children'])
  return (
    <MenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={local.inset || undefined}
      class={cn(
        "flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground data-[inset]:pl-7 data-expanded:bg-accent data-expanded:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        local.class
      )}
      {...rest}
    >
      {local.children}
      <ChevronRightIcon class="ml-auto" />
    </MenuPrimitive.SubTrigger>
  )
}

function DropdownMenuSubContent(props: ComponentProps<typeof MenuPrimitive.SubContent>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.SubContent
        data-slot="dropdown-menu-sub-content"
        placement="right-start"
        shift={-3}
        gutter={0}
        class={cn(
          'z-50 max-h-(--kb-popper-content-available-height) w-auto min-w-[96px] origin-(--kb-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 outline-none data-expanded:animate-in data-expanded:fade-in-0 data-expanded:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
          local.class
        )}
        {...rest}
      />
    </MenuPrimitive.Portal>
  )
}

function DropdownMenuCheckboxItem(
  props: ComponentProps<typeof MenuPrimitive.CheckboxItem> & {
    inset?: boolean
  }
) {
  const [local, rest] = splitProps(props, ['class', 'children', 'inset'])
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={local.inset || undefined}
      class={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-highlighted:**:text-accent-foreground data-[inset]:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        local.class
      )}
      {...rest}
    >
      <span
        class="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <MenuPrimitive.ItemIndicator>
          <CheckIcon />
        </MenuPrimitive.ItemIndicator>
      </span>
      {local.children}
    </MenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuRadioGroup(props: ComponentProps<typeof MenuPrimitive.RadioGroup>) {
  return <MenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />
}

function DropdownMenuRadioItem(
  props: ComponentProps<typeof MenuPrimitive.RadioItem> & {
    inset?: boolean
  }
) {
  const [local, rest] = splitProps(props, ['class', 'children', 'inset'])
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={local.inset || undefined}
      class={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[inset]:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        local.class
      )}
      {...rest}
    >
      <span class="pointer-events-none absolute right-2">
        <MenuPrimitive.ItemIndicator>
          <CheckIcon />
        </MenuPrimitive.ItemIndicator>
      </span>
      {local.children}
    </MenuPrimitive.RadioItem>
  )
}

function DropdownMenuSeparator(props: ComponentProps<typeof MenuPrimitive.Separator>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      class={cn('pointer-events-none -mx-1 my-1 h-px bg-border', local.class)}
      {...rest}
    />
  )
}

function DropdownMenuShortcut(props: ComponentProps<'span'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      class={cn(
        'ml-auto text-xs tracking-widest text-muted-foreground group-data-highlighted/dropdown-menu-item:text-accent-foreground',
        local.class
      )}
      {...rest}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}

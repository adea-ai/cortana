import { Command as CommandPrimitive } from 'cmdk-solid'
import { splitProps, type ComponentProps, type JSX } from 'solid-js'

import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/shadcn/dialog'
import { InputGroup, InputGroupAddon } from '@/components/shadcn/input-group'
import { SearchIcon, CheckIcon } from 'lucide-solid'

function Command(props: ComponentProps<typeof CommandPrimitive>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <CommandPrimitive
      data-slot="command"
      class={cn(
        'flex size-full flex-col overflow-hidden rounded-xl! bg-popover p-1 text-popover-foreground',
        local.class
      )}
      {...rest}
    />
  )
}

function CommandDialog(
  props: ComponentProps<typeof Dialog> & {
    title?: string
    description?: string
    class?: string
    showCloseButton?: boolean
    finalFocus?: { current: HTMLElement | null } | null
    children: JSX.Element
  }
) {
  const [local, rest] = splitProps(props, [
    'title',
    'description',
    'class',
    'showCloseButton',
    'finalFocus',
    'children',
  ])
  return (
    <Dialog {...rest}>
      <DialogHeader class="sr-only">
        <DialogTitle>{local.title ?? 'Command Palette'}</DialogTitle>
        <DialogDescription>
          {local.description ?? 'Search for a command to run...'}
        </DialogDescription>
      </DialogHeader>
      <DialogContent
        class={cn('top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0', local.class)}
        showCloseButton={local.showCloseButton ?? false}
        finalFocus={local.finalFocus}
      >
        {local.children}
      </DialogContent>
    </Dialog>
  )
}

function CommandInput(props: ComponentProps<typeof CommandPrimitive.Input>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <div data-slot="command-input-wrapper" class="p-1 pb-0">
      <InputGroup class="h-8! rounded-lg! border-input/30 bg-input/30 shadow-none! *:data-[slot=input-group-addon]:pl-2!">
        <CommandPrimitive.Input
          data-slot="command-input"
          class={cn(
            'w-full text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50',
            local.class
          )}
          {...rest}
        />
        <InputGroupAddon>
          <SearchIcon class="size-4 shrink-0 opacity-50" />
        </InputGroupAddon>
      </InputGroup>
    </div>
  )
}

function CommandList(props: ComponentProps<typeof CommandPrimitive.List>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      class={cn(
        'no-scrollbar max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto outline-none',
        local.class
      )}
      {...rest}
    />
  )
}

function CommandEmpty(props: ComponentProps<typeof CommandPrimitive.Empty>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      class={cn('py-6 text-center text-sm', local.class)}
      {...rest}
    />
  )
}

function CommandGroup(props: ComponentProps<typeof CommandPrimitive.Group>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      class={cn(
        'overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground',
        local.class
      )}
      {...rest}
    />
  )
}

function CommandSeparator(props: ComponentProps<typeof CommandPrimitive.Separator>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      class={cn('-mx-1 h-px bg-border', local.class)}
      {...rest}
    />
  )
}

function CommandItem(props: ComponentProps<typeof CommandPrimitive.Item>) {
  const [local, rest] = splitProps(props, ['class', 'children'])
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      class={cn(
        "group/command-item relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none in-data-[slot=dialog-content]:rounded-lg! data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-selected:bg-muted data-selected:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-selected:*:[svg]:text-foreground",
        local.class
      )}
      {...rest}
    >
      {local.children}
      <CheckIcon class="ml-auto opacity-0 group-has-data-[slot=command-shortcut]/command-item:hidden group-data-[checked=true]/command-item:opacity-100" />
    </CommandPrimitive.Item>
  )
}

function CommandShortcut(props: ComponentProps<'span'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <span
      data-slot="command-shortcut"
      class={cn(
        'ml-auto text-xs tracking-widest text-muted-foreground group-data-[selected]/command-item:text-foreground',
        local.class
      )}
      {...rest}
    />
  )
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
}

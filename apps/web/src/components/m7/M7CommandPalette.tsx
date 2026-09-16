import { For } from 'solid-js'

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/shadcn/command'
import { shortcutLabel } from '@/shortcuts'

export type M7CommandPaletteProps = {
  open: boolean
  finalFocus: { current: HTMLElement | null }
  workspaces: Array<{ id: string; name: string; color: string | null }>
  onOpenChange: (open: boolean) => void
  onSearch: () => void
  onFilterDocuments: () => void
  onChooseWorkspace: (workspace: string) => void
  onOpenSettings: () => void
}

export function M7CommandPalette(props: M7CommandPaletteProps) {
  const run = (action: () => void) => {
    props.onOpenChange(false)
    action()
  }

  return (
    <CommandDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      finalFocus={props.finalFocus}
      title="Cortana command palette"
      description="Search navigation and workspace commands"
    >
      <Command label="Search Cortana commands">
        <CommandInput placeholder="Search commands…" />
        <CommandList>
          <CommandEmpty>No commands found.</CommandEmpty>
          <CommandGroup heading="Actions">
            <CommandItem onSelect={() => run(props.onSearch)}>
              Search the brain
              <CommandShortcut>{shortcutLabel('MOD K')}</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => run(props.onFilterDocuments)}>
              Filter documents
              <CommandShortcut>{shortcutLabel('MOD ⇧ F')}</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => run(props.onOpenSettings)}>Open settings</CommandItem>
          </CommandGroup>
          <CommandGroup heading="Workspaces">
            <For each={props.workspaces}>
              {(item) => (
                <CommandItem onSelect={() => run(() => props.onChooseWorkspace(item.id))}>
                  Switch to {item.name}
                </CommandItem>
              )}
            </For>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}

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
} from '@adea-ai/ui/components/ui/command'
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
      // Kobalte's close-focus contract is this hook, not the old finalFocus
      // ref object the local dialog accepted.
      onCloseAutoFocus={(event: Event) => {
        const target = props.finalFocus?.current
        if (target) {
          event.preventDefault()
          target.focus()
        }
      }}
      // The shared CommandDialog is a bare cmdk dialog: the accessible name
      // the old local title/description props provided comes from this label.
      aria-label="Cortana command palette"
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

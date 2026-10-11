import { For } from 'solid-js'

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@adea-ai/ui/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@adea-ai/ui/components/ui/dialog'
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
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        class="top-1/3 translate-y-0 overflow-hidden p-0"
        closeButton={false}
        onCloseAutoFocus={(event) => {
          const target = props.finalFocus.current
          if (!target?.isConnected) return
          event.preventDefault()
          target.focus()
        }}
      >
        <DialogHeader class="sr-only">
          <DialogTitle>Cortana command palette</DialogTitle>
          <DialogDescription>Search navigation and workspace commands</DialogDescription>
        </DialogHeader>
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
      </DialogContent>
    </Dialog>
  )
}

import { createSignal, For, Show, type JSX, onCleanup, onMount } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  CircleHelp,
  Database,
  GitFork,
  Inbox,
  LoaderCircle,
  MessageCircle,
  MoreVertical,
  Search,
  Settings,
  Sparkles,
  TerminalSquare,
} from 'lucide-solid'

import { Badge } from '@/components/shadcn/badge'
import { Button } from '@/components/shadcn/button'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/shadcn/breadcrumb'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/shadcn/dropdown-menu'
import { Input } from '@/components/shadcn/input'
import { ScrollArea, ScrollBar } from '@/components/shadcn/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/shadcn/sheet'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/shadcn/sidebar'
import { useSidebar } from '@/components/shadcn/sidebar-context'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/shadcn/tooltip'
import { shortcutLabel } from '@/shortcuts'
import type { M7ActivityInbox } from '@/components/m7/M7ActivityInbox'
import { WorkspaceLogo } from '@/workspaceLogos'

type WorkspaceOption = { id: string; name: string; color: string | null }

export type AppView =
  | 'knowledge'
  | 'settings'
  | 'inbox'
  | 'conversations'
  | 'agent-tools'
  | 'index'
  | 'help'

export type M7NavigationProps = {
  view: AppView
  workspaceTab?: 'answer' | 'document' | 'sources' | 'graph' | 'timeline'
  onNavigate: (view: AppView) => void
  onOpenGraph: () => void
}

export type M7HeaderProps = {
  query: string
  loading: boolean
  searchRef: { current: HTMLInputElement | null }
  canGoBack: boolean
  canGoForward: boolean
  onQueryChange: (value: string) => void
  onSubmit: (event: SubmitEvent) => void
  onReflect: () => void
  onHistoryBack: () => void
  onHistoryForward: () => void
  onOpenSources: (origin?: HTMLElement | null) => void
  onOpenFilters: () => void
  onOpenHistory: () => void
  onOpenContext: (origin?: HTMLElement | null) => void
  onOpenCommands: (origin?: HTMLElement | null) => void
  workspaceName: string
  location: string
}

export type M7CommandPaletteProps = {
  open: boolean
  finalFocus: { current: HTMLElement | null }
  workspaces: WorkspaceOption[]
  onOpenChange: (open: boolean) => void
  onSearch: () => void
  onFilterDocuments: () => void
  onChooseWorkspace: (workspace: string) => void
  onOpenSettings: () => void
}

const navigationItems = [
  { view: 'knowledge' as const, label: 'Knowledge', icon: BookOpenText },
  { view: 'conversations' as const, label: 'Conversations', icon: MessageCircle },
]

export function M7ApplicationHeader(props: M7HeaderProps) {
  const actionsRef = { current: null as HTMLButtonElement | null }
  return (
    <header class="m7-application-header min-h-14 shrink-0 border-b px-2 backdrop-blur md:px-4">
      <div class="m7-header-leading flex min-w-0 items-center gap-1">
        <SidebarTrigger aria-label="Toggle navigation" />
        <div class="m7-header-context hidden min-w-0 items-center gap-1 sm:flex">
          <div class="flex items-center gap-1" role="group" aria-label="Search history">
            <Tooltip>
              <TooltipTrigger
                as={Button}
                variant="ghost"
                size="icon"
                aria-label="Previous search query"
                disabled={!props.canGoBack}
                onClick={props.onHistoryBack}
              >
                <ArrowLeft aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent>Previous search query</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                as={Button}
                variant="ghost"
                size="icon"
                aria-label="Next search query"
                disabled={!props.canGoForward}
                onClick={props.onHistoryForward}
              >
                <ArrowRight aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent>Next search query</TooltipContent>
            </Tooltip>
          </div>
          <Breadcrumb class="hidden min-w-0 lg:block">
            <BreadcrumbList>
              <BreadcrumbItem>{props.workspaceName}</BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{props.location}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </div>
      <div class="m7-search-cluster flex min-w-0 items-center justify-center gap-2">
        <form class="relative min-w-0 flex-1" onSubmit={props.onSubmit}>
          <Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={(el) => (props.searchRef.current = el)}
            aria-label="Search your knowledge"
            class="h-9 pr-16 pl-9"
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
          />
          <span class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted-foreground">
            {props.loading ? (
              <LoaderCircle class="size-4 animate-spin" aria-label="Searching" />
            ) : (
              <kbd>{shortcutLabel('MOD K')}</kbd>
            )}
          </span>
        </form>
        <Button
          type="button"
          size="sm"
          aria-label="Reflect on this objective"
          onClick={props.onReflect}
          disabled={props.loading || !props.query.trim()}
        >
          <Sparkles aria-hidden="true" />
          <span class="hidden md:inline">Reflect</span>
        </Button>
      </div>
      <div class="m7-header-actions flex items-center justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger
            as={Button}
            ref={(el: HTMLButtonElement) => (actionsRef.current = el)}
            variant="outline"
            size="icon"
            aria-label="Actions"
            title="Actions"
          >
            <MoreVertical aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Workspace</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => props.onOpenSources(actionsRef.current)}>
                Open sources
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={props.onOpenFilters}>Filter documents</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => props.onOpenContext(actionsRef.current)}>
                Open agent context
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={props.onOpenHistory}>Open conversations</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Search history</DropdownMenuLabel>
              <DropdownMenuItem disabled={!props.canGoBack} onSelect={props.onHistoryBack}>
                Previous query
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!props.canGoForward} onSelect={props.onHistoryForward}>
                Next query
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => props.onOpenCommands(actionsRef.current)}>
                Command palette
                <span class="ml-auto text-xs text-muted-foreground">{shortcutLabel('MOD P')}</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
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

export type M7StatusBarProps = { children: JSX.Element; demo: boolean }

export type M7PanelBoundaryProps = {
  side: 'left' | 'right'
  breakpoint: number
  open: boolean
  title: string
  description: string
  finalFocus: { current: HTMLElement | null }
  onOpenChange: (open: boolean) => void
  children: JSX.Element
}

export function M7PanelBoundary(props: M7PanelBoundaryProps) {
  const [compact, setCompact] = createSignal(false)

  onMount(() => {
    const query = window.matchMedia(`(max-width: ${props.breakpoint - 1}px)`)
    const update = () => setCompact(query.matches)
    update()
    query.addEventListener('change', update)
    onCleanup(() => query.removeEventListener('change', update))
  })

  return (
    <Show when={compact()} fallback={props.children}>
      <Sheet open={props.open} onOpenChange={props.onOpenChange}>
        <SheetContent
          finalFocus={props.finalFocus}
          side={props.side}
          class="m7-panel-boundary max-w-none gap-0 p-0"
        >
          <SheetHeader class="sr-only">
            <SheetTitle>{props.title}</SheetTitle>
            <SheetDescription>{props.description}</SheetDescription>
          </SheetHeader>
          {props.children}
        </SheetContent>
      </Sheet>
    </Show>
  )
}

export function M7StatusBar(props: M7StatusBarProps) {
  return (
    <footer class="shrink-0 border-t bg-background" aria-label="Application status">
      <ScrollArea class="w-full whitespace-nowrap">
        <div class="flex min-h-10 items-center gap-3 px-3 py-1.5 text-xs text-muted-foreground">
          {props.children}
          <span class="ml-auto" />
          <Show when={props.demo}>
            <Badge variant="secondary">Demo data</Badge>
          </Show>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </footer>
  )
}

export function M7ApplicationNavigation(props: {
  navigation: M7NavigationProps
  workspaces: WorkspaceOption[]
  workspace: string
  onWorkspaceChange: (workspace: string) => void
}) {
  const activeWorkspace = () => props.workspaces.find((item) => item.id === props.workspace)
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = createSignal(false)
  const { isMobile, mobileFinalFocusRef, mobileTriggerRef, setOpenMobile } = useSidebar()
  const runNavigation = (action: () => void, focusDestination = false) => {
    action()
    if (isMobile()) {
      mobileFinalFocusRef.current =
        focusDestination && document.activeElement instanceof HTMLElement
          ? document.activeElement
          : mobileTriggerRef.current
      setOpenMobile(false)
    }
  }

  const navActive = (view: 'knowledge' | 'conversations') =>
    props.navigation.view === view &&
    (view !== 'knowledge' || props.navigation.workspaceTab !== 'graph')

  return (
    <Sidebar
      variant="sidebar"
      collapsible="icon"
      role="navigation"
      aria-label="Primary navigation"
      class="m7-application-sidebar"
    >
      <SidebarHeader class="m7-workspace-header">
        <DropdownMenu open={workspaceMenuOpen()} onOpenChange={setWorkspaceMenuOpen}>
          <DropdownMenuTrigger
            as={SidebarMenuButton}
            size="lg"
            class="m7-workspace-trigger p-0"
            tooltip={`Workspace: ${activeWorkspace()?.name ?? 'Choose workspace'}`}
            aria-label="Switch workspace"
          >
            <Show
              when={activeWorkspace()}
              fallback={
                <span
                  class="workspace-logo workspace-logo--large workspace-picker-mark"
                  aria-hidden="true"
                >
                  ?
                </span>
              }
            >
              {(workspace) => <WorkspaceLogo workspace={workspace()} size="large" />}
            </Show>
            <span data-workspace-labels class="min-w-0 flex-1 pr-2 text-left">
              <span class="block truncate text-sm font-medium">
                {activeWorkspace()?.name ?? 'Choose workspace'}
              </span>
              <span class="block truncate text-xs text-muted-foreground">Workspace</span>
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={6} class="min-w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={props.workspace}
                onChange={(value: unknown) =>
                  runNavigation(() => {
                    setWorkspaceMenuOpen(false)
                    props.onWorkspaceChange(value as string)
                  })
                }
              >
                <For each={props.workspaces}>
                  {(item) => (
                    <DropdownMenuRadioItem value={item.id} closeOnSelect>
                      <WorkspaceLogo workspace={item} size="small" />
                      {item.name}
                    </DropdownMenuRadioItem>
                  )}
                </For>
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup class="p-3">
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu class="gap-0.5">
              <For each={navigationItems}>
                {({ view, label, icon }) => (
                  <>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        size="lg"
                        tooltip={label}
                        isActive={navActive(view)}
                        aria-current={navActive(view) ? 'page' : undefined}
                        onClick={() => runNavigation(() => props.navigation.onNavigate(view))}
                      >
                        <Dynamic component={icon} aria-hidden="true" />
                        <span>{label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <Show when={view === 'knowledge'}>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          size="lg"
                          tooltip="Graph"
                          isActive={
                            props.navigation.view === 'knowledge' &&
                            props.navigation.workspaceTab === 'graph'
                          }
                          aria-current={
                            props.navigation.view === 'knowledge' &&
                            props.navigation.workspaceTab === 'graph'
                              ? 'page'
                              : undefined
                          }
                          onClick={() => runNavigation(props.navigation.onOpenGraph)}
                        >
                          <GitFork aria-hidden="true" />
                          <span>Graph</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </Show>
                    <Show when={view === 'conversations'}>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          size="lg"
                          tooltip="Agent tools"
                          isActive={props.navigation.view === 'agent-tools'}
                          aria-current={
                            props.navigation.view === 'agent-tools' ? 'page' : undefined
                          }
                          onClick={() =>
                            runNavigation(() => props.navigation.onNavigate('agent-tools'))
                          }
                        >
                          <TerminalSquare aria-hidden="true" />
                          <span>Agent tools</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </Show>
                  </>
                )}
              </For>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter class="p-3">
        <SidebarMenu class="gap-0.5">
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="Settings"
              isActive={props.navigation.view === 'settings'}
              aria-current={props.navigation.view === 'settings' ? 'page' : undefined}
              onClick={() => runNavigation(() => props.navigation.onNavigate('settings'))}
            >
              <Settings aria-hidden="true" />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="Inbox"
              isActive={props.navigation.view === 'inbox'}
              aria-current={props.navigation.view === 'inbox' ? 'page' : undefined}
              onClick={() => runNavigation(() => props.navigation.onNavigate('inbox'))}
            >
              <Inbox aria-hidden="true" />
              <span>Inbox</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="Index"
              isActive={props.navigation.view === 'index'}
              aria-current={props.navigation.view === 'index' ? 'page' : undefined}
              onClick={() => runNavigation(() => props.navigation.onNavigate('index'))}
            >
              <Database aria-hidden="true" />
              <span>Index</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="Help"
              isActive={props.navigation.view === 'help'}
              aria-current={props.navigation.view === 'help' ? 'page' : undefined}
              onClick={() => runNavigation(() => props.navigation.onNavigate('help'))}
            >
              <CircleHelp aria-hidden="true" />
              <span>Help</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

export function M7ShellProvider(props: { children: JSX.Element }) {
  return (
    <TooltipProvider delay={250}>
      <SidebarProvider
        defaultOpen={false}
        class="m7-shell-provider min-h-0 overflow-hidden"
        style={{ '--sidebar-width-icon': '3.5rem' } as JSX.CSSProperties}
      >
        {props.children}
      </SidebarProvider>
    </TooltipProvider>
  )
}

export type M7ShellProviderProps = { children: JSX.Element }

export type M7ShellComponents = {
  ActivityInbox: typeof M7ActivityInbox
  ApplicationHeader: typeof M7ApplicationHeader
  ApplicationNavigation: typeof M7ApplicationNavigation
  CommandPalette: typeof M7CommandPalette
  PanelBoundary: typeof M7PanelBoundary
  ShellProvider: typeof M7ShellProvider
  StatusBar: typeof M7StatusBar
}

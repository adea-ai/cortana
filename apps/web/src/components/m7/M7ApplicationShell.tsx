import { createSignal, For, Show, type JSX } from 'solid-js'
import { Dynamic } from 'solid-js/web'

import { createMediaQuery } from '@/lib/mediaQuery'
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  CircleHelp,
  Info,
  Database,
  GitFork,
  Inbox,
  LoaderCircle,
  MessageCircle,
  MoreVertical,
  RefreshCw,
  Search,
  Settings,
  Settings2,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
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
import { isDesktopApp } from '@/api'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/shadcn/tooltip'
import { shortcutLabel } from '@/shortcuts'
import type { M7ActivityInbox } from '@/components/m7/M7ActivityInbox'
import type { M7CommandPalette } from '@/components/m7/M7CommandPalette'
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
  /** Opens Settings on a named section, used by the utilities menu. */
  onOpenSettingsSection?: (section: 'updates' | 'services') => void
  /** Opens the identity dialog behind the About entry. */
  onOpenAbout?: () => void
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

const navigationItems = [
  { view: 'knowledge' as const, label: 'Knowledge', icon: BookOpenText },
  { view: 'conversations' as const, label: 'Conversations', icon: MessageCircle },
]

type UtilityItem = {
  id: 'about' | 'help' | 'index' | 'updates' | 'settings'
  label: string
  icon: typeof CircleHelp
  /** Hidden on web, where the surface it opens does not exist (as upstream). */
  desktopOnly?: boolean
  /** Chord rendered on the right of the entry; `undefined` when none is bound. */
  shortcut?: string
  run: (navigation: M7NavigationProps) => void
  current: (view: AppView) => boolean
}

/**
 * Destinations behind the single utilities trigger. Inbox keeps its own rail
 * row; the rest of the footer's former rows live here so the collapsed column
 * stays a short list of surfaces instead of a stack of icon-only entries. The
 * sequence mirrors the account menu in the sibling shell (help, app surfaces,
 * updates, settings), minus the entries this app has no surface for.
 *
 * The list is static and both callbacks take what they need as arguments: the
 * shell re-renders its navigation props on every view change, so an item that
 * closed over that object would keep testing the view it was built with and the
 * trigger's active state would never change again.
 */
const utilityItems: UtilityItem[] = [
  {
    id: 'about',
    label: 'About',
    icon: Info,
    run: (navigation) => navigation.onOpenAbout?.(),
    current: () => false,
  },
  {
    id: 'help',
    label: 'Help',
    icon: CircleHelp,
    run: (navigation) => navigation.onNavigate('help'),
    current: (view) => view === 'help',
  },
  {
    id: 'index',
    label: 'Index',
    icon: Database,
    run: (navigation) => navigation.onNavigate('index'),
    current: (view) => view === 'index',
  },
  {
    id: 'updates',
    label: 'Updates',
    icon: RefreshCw,
    desktopOnly: true,
    run: (navigation) => navigation.onOpenSettingsSection?.('updates'),
    current: () => false,
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings2,
    shortcut: shortcutLabel('MOD,'),
    run: (navigation) => navigation.onNavigate('settings'),
    current: (view) => view === 'settings',
  },
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
  const compact = createMediaQuery(() => `(max-width: ${props.breakpoint - 1}px)`)

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

/** The active workspace's mark, with the placeholder tile when none is set. */
function WorkspaceGlyph(props: {
  workspace: WorkspaceOption | undefined
  size: 'small' | 'large'
}) {
  return (
    <Show
      when={props.workspace}
      fallback={
        <span
          class={`workspace-logo workspace-logo--${props.size} workspace-picker-mark`}
          aria-hidden="true"
        >
          ?
        </span>
      }
    >
      {(workspace) => <WorkspaceLogo workspace={workspace()} size={props.size} />}
    </Show>
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
  const [utilitiesMenuOpen, setUtilitiesMenuOpen] = createSignal(false)
  // Read the view through the props accessor: capturing `props.navigation`
  // here would freeze the entry-state comparisons at mount.
  const currentView = () => props.navigation.view
  const visibleUtilityItems = () => utilityItems.filter((item) => !item.desktopOnly || isDesktopApp)
  const utilitiesActive = () => visibleUtilityItems().some((item) => item.current(currentView()))
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
        <Show
          when={!isMobile()}
          // Same boundary as the utilities entries: a dropdown opened inside the
          // modal sheet renders outside its aria-hidden subtree, so on small
          // screens the workspaces are listed as rows in the sheet instead.
          fallback={
            <div class="m7-workspace-identity">
              <WorkspaceGlyph workspace={activeWorkspace()} size="large" />
              <span class="min-w-0 flex-1 pr-2 text-left">
                <span class="block truncate text-sm font-medium">
                  {activeWorkspace()?.name ?? 'Choose workspace'}
                </span>
                <span class="block truncate text-xs text-muted-foreground">Workspace</span>
              </span>
            </div>
          }
        >
          <DropdownMenu open={workspaceMenuOpen()} onOpenChange={setWorkspaceMenuOpen}>
            <DropdownMenuTrigger
              as={SidebarMenuButton}
              size="lg"
              class="m7-workspace-trigger p-0"
              hintIcon={() => <WorkspaceGlyph workspace={activeWorkspace()} size="small" />}
              tooltip={`Workspace: ${activeWorkspace()?.name ?? 'Choose workspace'}`}
              aria-label="Switch workspace"
            >
              <WorkspaceGlyph workspace={activeWorkspace()} size="large" />
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
        </Show>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <Show when={isMobile()}>
          <SidebarGroup class="p-3">
            <SidebarGroupLabel>Workspaces</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu class="gap-0.5">
                <For each={props.workspaces}>
                  {(item) => (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        size="lg"
                        icon={() => <WorkspaceGlyph workspace={item} size="small" />}
                        tooltip={item.name}
                        isActive={item.id === props.workspace}
                        aria-current={item.id === props.workspace ? 'page' : undefined}
                        onClick={() => runNavigation(() => props.onWorkspaceChange(item.id))}
                      >
                        <span>{item.name}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </For>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </Show>
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
                        icon={icon}
                        tooltip={label}
                        isActive={navActive(view)}
                        aria-current={navActive(view) ? 'page' : undefined}
                        onClick={() => runNavigation(() => props.navigation.onNavigate(view))}
                      >
                        <span>{label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <Show when={view === 'knowledge'}>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          size="lg"
                          icon={GitFork}
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
                          <span>Graph</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </Show>
                    <Show when={view === 'conversations'}>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          size="lg"
                          icon={TerminalSquare}
                          tooltip="Agent tools"
                          isActive={props.navigation.view === 'agent-tools'}
                          aria-current={
                            props.navigation.view === 'agent-tools' ? 'page' : undefined
                          }
                          onClick={() =>
                            runNavigation(() => props.navigation.onNavigate('agent-tools'))
                          }
                        >
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
              icon={Inbox}
              tooltip="Inbox"
              isActive={props.navigation.view === 'inbox'}
              aria-current={props.navigation.view === 'inbox' ? 'page' : undefined}
              onClick={() => runNavigation(() => props.navigation.onNavigate('inbox'))}
            >
              <span>Inbox</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <Show
            when={!isMobile()}
            // The compact rail has no room for these rows, so it folds them into
            // one trigger. The sheet does have room, and a dropdown opened from
            // inside a modal sheet lands outside its aria-hidden boundary, where
            // its items are unreachable — so small screens keep plain rows.
            fallback={
              <For each={visibleUtilityItems()}>
                {(item) => (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      size="lg"
                      icon={item.icon}
                      tooltip={item.label}
                      isActive={item.current(currentView())}
                      aria-current={item.current(currentView()) ? 'page' : undefined}
                      onClick={() => runNavigation(() => item.run(props.navigation))}
                    >
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </For>
            }
          >
            <SidebarMenuItem>
              <DropdownMenu open={utilitiesMenuOpen()} onOpenChange={setUtilitiesMenuOpen}>
                <DropdownMenuTrigger
                  as={SidebarMenuButton}
                  size="lg"
                  icon={Settings}
                  tooltip="Settings and utilities"
                  aria-label="Settings and utilities"
                  isActive={utilitiesActive()}
                >
                  <span>Settings</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  class="m7-utilities-menu"
                  align="start"
                  side="top"
                  sideOffset={0}
                >
                  <DropdownMenuGroup>
                    <For each={visibleUtilityItems()}>
                      {(item) => (
                        <DropdownMenuItem
                          aria-current={item.current(currentView()) ? 'page' : undefined}
                          // Kobalte closes a menu 1ms after a selection, and the
                          // destination's own render can land inside that window.
                          // Closing here keeps the trigger's next activation
                          // opening the menu instead of toggling a stale open one.
                          onSelect={() => {
                            setUtilitiesMenuOpen(false)
                            runNavigation(() => item.run(props.navigation))
                          }}
                        >
                          <Dynamic component={item.icon} aria-hidden="true" />
                          <span>{item.label}</span>
                          <Show when={item.shortcut}>
                            {/* Hidden like the reference menu's chord badge: the
                                item's accessible name stays its label. */}
                            {(keys) => (
                              <DropdownMenuShortcut aria-hidden="true">
                                {keys()}
                              </DropdownMenuShortcut>
                            )}
                          </Show>
                        </DropdownMenuItem>
                      )}
                    </For>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </Show>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

export function M7ShellProvider(props: { children: JSX.Element }) {
  return (
    // 150ms: long enough to survive a pointer crossing a control, short enough
    // that action help feels immediate beside the rail's own label flyout.
    <TooltipProvider delay={150}>
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

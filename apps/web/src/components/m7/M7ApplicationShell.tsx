import { Kbd } from '@adea-ai/ui/components/ui/kbd'
import { Spinner } from '@adea-ai/ui/components/ui/spinner'
import {
  createContext,
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  useContext,
  type JSX,
} from 'solid-js'
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
  MessageCircle,
  MoreVertical,
  PanelLeftIcon,
  RefreshCw,
  Search,
  Settings,
  Settings2,
  Sparkles,
  TerminalSquare,
} from 'lucide-solid'

import { Badge } from '@adea-ai/ui/components/ui/badge'
import { EntityIcon } from '@adea-ai/ui/components/ui/entity-icon'
import { ActionButton as Button } from '@adea-ai/ui/components/composites/action-button'
import {
  SideRail,
  SideRailButton,
  SideRailContent,
  SideRailFooter,
  SideRailHeader,
  SideRailItem,
  SideRailSection,
} from '@adea-ai/ui/components/layout/side-rail'
import { StatusBar, StatusBarSpacer } from '@adea-ai/ui/components/layout/status-bar'
import { Popover, PopoverContent, PopoverTrigger } from '@adea-ai/ui/components/ui/popover'
import { Activity } from 'lucide-solid'
import { TopBar, TopBarSection } from '@adea-ai/ui/components/layout/top-bar'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@adea-ai/ui/components/ui/breadcrumb'
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
} from '@adea-ai/ui/components/ui/dropdown-menu'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@adea-ai/ui/components/ui/input-group'
import { ScrollArea } from '@adea-ai/ui/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@adea-ai/ui/components/ui/sheet'
import { isDesktopApp } from '@/api'
import { TooltipProvider } from '@adea-ai/ui/components/ui/tooltip'
import { shortcutLabel } from '@/shortcuts'
import type { M7ActivityInbox } from '@/components/m7/M7ActivityInbox'
import type { M7CommandPalette } from '@/components/m7/M7CommandPalette'
import { WorkspaceLogo } from '@/workspaceLogos'

type WorkspaceOption = { id: string; name: string; color: string | null }

type CortanaNavigationValue = {
  collapsed: () => boolean
  setCollapsed: (collapsed: boolean) => void
  isMobile: () => boolean
  openMobile: () => boolean
  setOpenMobile: (open: boolean) => void
  toggleNavigation: () => void
  mobileTriggerRef: { current: HTMLButtonElement | null }
  mobileFinalFocusRef: { current: HTMLElement | null }
}

const CortanaNavigationContext = createContext<CortanaNavigationValue>()

function useCortanaNavigation() {
  const value = useContext(CortanaNavigationContext)
  if (!value) throw new Error('Cortana navigation must be used within M7ShellProvider.')
  return value
}

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
  systemActions?: JSX.Element
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
  const [systemOpen, setSystemOpen] = createSignal(false)
  const navigation = useCortanaNavigation()
  return (
    <TopBar class="m7-application-header" glass>
      <TopBarSection class="m7-header-leading">
        <Button
          tooltip="Toggle navigation"
          ref={(element: HTMLButtonElement) => (navigation.mobileTriggerRef.current = element)}
          variant="ghost"
          size="icon-sm"
          aria-label="Toggle navigation"
          aria-expanded={navigation.isMobile() ? navigation.openMobile() : !navigation.collapsed()}
          aria-controls="m7-primary-navigation"
          onClick={navigation.toggleNavigation}
        >
          <PanelLeftIcon aria-hidden="true" />
        </Button>
        <div class="m7-header-context hidden min-w-0 items-center gap-1 sm:flex">
          <div class="flex items-center gap-1" role="group" aria-label="Search history">
            <Button
              tooltip={
                props.canGoBack ? 'Return to the previous search query' : 'No previous search query'
              }
              variant="ghost"
              size="icon-sm"
              aria-label="Previous search query"
              disabled={!props.canGoBack}
              onClick={props.onHistoryBack}
            >
              <ArrowLeft aria-hidden="true" />
            </Button>
            <Button
              tooltip={
                props.canGoForward ? 'Return to the next search query' : 'No next search query'
              }
              variant="ghost"
              size="icon-sm"
              aria-label="Next search query"
              disabled={!props.canGoForward}
              onClick={props.onHistoryForward}
            >
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
          <Breadcrumb class="hidden min-w-0 lg:block">
            <BreadcrumbList>
              <BreadcrumbItem>{props.workspaceName}</BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {/* The shared breadcrumb has no page part; a current-page span is its contract. */}
                <span aria-current="page" class="font-normal text-foreground">
                  {props.location}
                </span>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </TopBarSection>
      <div class="m7-search-cluster flex min-w-0 items-center justify-center gap-2">
        <form class="min-w-0 flex-1" onSubmit={props.onSubmit}>
          <InputGroup>
            <InputGroupAddon>
              <Search aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              ref={(el) => (props.searchRef.current = el)}
              aria-label="Search your knowledge"
              value={props.query}
              onInput={(event) => props.onQueryChange(event.target.value)}
            />
            <InputGroupAddon align="end">
              {props.loading ? (
                <Spinner size="md" label="Searching" />
              ) : (
                <Kbd>{shortcutLabel('MOD K')}</Kbd>
              )}
            </InputGroupAddon>
          </InputGroup>
        </form>
        <Button
          tooltip="Reflect on this objective"
          type="button"
          size="xs"
          aria-label="Reflect on this objective"
          onClick={props.onReflect}
          disabled={props.loading || !props.query.trim()}
        >
          <Sparkles aria-hidden="true" />
          <span class="hidden md:inline">Reflect</span>
        </Button>
      </div>
      <TopBarSection align="end" class="m7-header-actions">
        <Show when={props.systemActions}>
          <Popover open={systemOpen()} onOpenChange={setSystemOpen}>
            <PopoverTrigger
              as={Button}
              variant="ghost"
              size="icon-sm"
              aria-label="System status"
              tooltip="Review source jobs, service health, installation, and update status."
            >
              <Activity aria-hidden="true" />
            </PopoverTrigger>
            <PopoverContent
              class="w-80 max-w-full"
              aria-label="System status details"
              onClick={(event: MouseEvent) => {
                if ((event.target as HTMLElement).closest('button, a')) setSystemOpen(false)
              }}
            >
              <h2 class="text-sm font-semibold">System status</h2>
              <div class="mt-3 flex flex-col items-start gap-2">{props.systemActions}</div>
            </PopoverContent>
          </Popover>
        </Show>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger
            as={Button}
            ref={(el: HTMLButtonElement) => (actionsRef.current = el)}
            variant="outline"
            size="icon-sm"
            aria-label="Actions"
            tooltip="Open workspace actions and search history."
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
      </TopBarSection>
    </TopBar>
  )
}

export type M7StatusBarProps = { children: JSX.Element; demo: boolean }

export type M7PanelBoundaryProps = {
  side: 'start' | 'end'
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
          // The shared Sheet delegates close-focus to Kobalte's
          // onCloseAutoFocus hook; the old local sheet took a ref object.
          onCloseAutoFocus={(event: Event) => {
            const target = props.finalFocus?.current
            if (target?.isConnected) {
              event.preventDefault()
              target.focus()
            }
          }}
          side={props.side}
          closeButton={false}
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
    <StatusBar aria-label="Application status">
      <ScrollArea class="w-full whitespace-nowrap">
        <div class="flex items-center gap-3">
          {props.children}
          <StatusBarSpacer />
          <Show when={props.demo}>
            <Badge variant="secondary">Demo data</Badge>
          </Show>
        </div>
      </ScrollArea>
    </StatusBar>
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
        <EntityIcon
          data-workspace-logo=""
          name="?"
          size={props.size === 'small' ? 'xs' : 'xl'}
          aria-hidden="true"
        />
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
  const currentView = () => props.navigation.view
  const visibleUtilityItems = () => utilityItems.filter((item) => !item.desktopOnly || isDesktopApp)
  const utilitiesActive = () => visibleUtilityItems().some((item) => item.current(currentView()))
  const { collapsed, isMobile, mobileFinalFocusRef, mobileTriggerRef, openMobile, setOpenMobile } =
    useCortanaNavigation()

  const dismissMobile = () => {
    mobileFinalFocusRef.current = mobileTriggerRef.current
    setOpenMobile(false)
  }
  const runNavigation = (action: () => void) => {
    action()
    if (isMobile()) dismissMobile()
  }
  const navActive = (view: 'knowledge' | 'conversations') =>
    props.navigation.view === view &&
    (view !== 'knowledge' || props.navigation.workspaceTab !== 'graph')

  const destinations = () => (
    <>
      <SideRailSection label="Workspace">
        <For each={navigationItems}>
          {({ view, label, icon: Icon }) => (
            <>
              <SideRailItem
                as="button"
                type="button"
                label={label}
                active={navActive(view)}
                onClick={() => runNavigation(() => props.navigation.onNavigate(view))}
              >
                <Icon aria-hidden="true" />
              </SideRailItem>
              <Show when={view === 'knowledge'}>
                <SideRailItem
                  as="button"
                  type="button"
                  label="Graph"
                  active={
                    props.navigation.view === 'knowledge' &&
                    props.navigation.workspaceTab === 'graph'
                  }
                  onClick={() => runNavigation(props.navigation.onOpenGraph)}
                >
                  <GitFork aria-hidden="true" />
                </SideRailItem>
              </Show>
              <Show when={view === 'conversations'}>
                <SideRailItem
                  as="button"
                  type="button"
                  label="Agent tools"
                  active={props.navigation.view === 'agent-tools'}
                  onClick={() => runNavigation(() => props.navigation.onNavigate('agent-tools'))}
                >
                  <TerminalSquare aria-hidden="true" />
                </SideRailItem>
              </Show>
            </>
          )}
        </For>
      </SideRailSection>
    </>
  )

  const mobileRail = () => (
    <SideRail id="m7-primary-navigation" collapsed={false} aria-label="Primary navigation">
      <SideRailHeader>
        <WorkspaceGlyph workspace={activeWorkspace()} size="large" />
        <span class="min-w-0 flex-1 pr-2 text-left">
          <span class="block truncate text-sm font-medium">
            {activeWorkspace()?.name ?? 'Choose workspace'}
          </span>
          <span class="block truncate text-xs text-muted-foreground">Workspace</span>
        </span>
      </SideRailHeader>
      <SideRailContent>
        <SideRailSection label="Workspaces">
          <For each={props.workspaces}>
            {(item) => (
              <SideRailItem
                as="button"
                type="button"
                label={item.name}
                active={item.id === props.workspace}
                onClick={() => runNavigation(() => props.onWorkspaceChange(item.id))}
              >
                <WorkspaceGlyph workspace={item} size="small" />
              </SideRailItem>
            )}
          </For>
        </SideRailSection>
        {destinations()}
      </SideRailContent>
      <SideRailFooter>
        <SideRailItem
          as="button"
          type="button"
          label="Inbox"
          active={props.navigation.view === 'inbox'}
          onClick={() => runNavigation(() => props.navigation.onNavigate('inbox'))}
        >
          <Inbox aria-hidden="true" />
        </SideRailItem>
        <For each={visibleUtilityItems()}>
          {(item) => (
            <SideRailItem
              as="button"
              type="button"
              label={item.label}
              active={item.current(currentView())}
              onClick={() => runNavigation(() => item.run(props.navigation))}
            >
              <Dynamic component={item.icon} aria-hidden="true" />
            </SideRailItem>
          )}
        </For>
      </SideRailFooter>
    </SideRail>
  )

  const desktopRail = () => (
    <SideRail id="m7-primary-navigation" collapsed={collapsed()} aria-label="Primary navigation">
      <SideRailHeader>
        <DropdownMenu modal={false} open={workspaceMenuOpen()} onOpenChange={setWorkspaceMenuOpen}>
          <DropdownMenuTrigger
            as={SideRailButton}
            label={`Workspace: ${activeWorkspace()?.name ?? 'Choose workspace'}`}
            aria-label="Switch workspace"
          >
            <WorkspaceGlyph workspace={activeWorkspace()} size="small" />
            <span class="min-w-0 flex-1 truncate text-left text-sm font-medium group-data-[collapsed=true]/rail:sr-only">
              {activeWorkspace()?.name ?? 'Choose workspace'}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={6} class="min-w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={props.workspace}
                onChange={(value: unknown) => {
                  setWorkspaceMenuOpen(false)
                  props.onWorkspaceChange(value as string)
                }}
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
      </SideRailHeader>
      <SideRailContent>{destinations()}</SideRailContent>
      <SideRailFooter>
        <SideRailItem
          as="button"
          type="button"
          label="Inbox"
          active={props.navigation.view === 'inbox'}
          onClick={() => props.navigation.onNavigate('inbox')}
        >
          <Inbox aria-hidden="true" />
        </SideRailItem>
        <DropdownMenu modal={false} open={utilitiesMenuOpen()} onOpenChange={setUtilitiesMenuOpen}>
          <DropdownMenuTrigger
            as={SideRailButton}
            label="Settings and utilities"
            aria-label="Settings and utilities"
            data-active={utilitiesActive() ? '' : undefined}
            active={utilitiesActive()}
          >
            <Settings aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate text-left text-sm group-data-[collapsed=true]/rail:sr-only">
              Settings
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent class="m7-utilities-menu" align="start" side="top" sideOffset={0}>
            <DropdownMenuGroup>
              <For each={visibleUtilityItems()}>
                {(item) => (
                  <DropdownMenuItem
                    aria-current={item.current(currentView()) ? 'page' : undefined}
                    onSelect={() => {
                      setUtilitiesMenuOpen(false)
                      item.run(props.navigation)
                    }}
                  >
                    <Dynamic component={item.icon} aria-hidden="true" />
                    <span>{item.label}</span>
                    <Show when={item.shortcut}>
                      {(keys) => (
                        <DropdownMenuShortcut aria-hidden="true">{keys()}</DropdownMenuShortcut>
                      )}
                    </Show>
                  </DropdownMenuItem>
                )}
              </For>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SideRailFooter>
    </SideRail>
  )

  return (
    <>
      <Show when={!isMobile()}>{desktopRail()}</Show>
      <Sheet open={openMobile()} onOpenChange={setOpenMobile}>
        <SheetContent
          data-mobile="true"
          side="start"
          closeButton={false}
          class="w-72 max-w-full gap-0 p-0"
          onCloseAutoFocus={(event: Event) => {
            const target = mobileFinalFocusRef.current ?? mobileTriggerRef.current
            if (target) {
              event.preventDefault()
              target.focus()
            }
          }}
        >
          <SheetHeader class="sr-only">
            <SheetTitle>Primary navigation</SheetTitle>
            <SheetDescription>Choose a workspace or application destination.</SheetDescription>
          </SheetHeader>
          {mobileRail()}
        </SheetContent>
      </Sheet>
    </>
  )
}

export function M7ShellProvider(props: { children: JSX.Element }) {
  const isMobile = createMediaQuery(() => '(max-width: 799px)')
  const [collapsed, setCollapsedState] = createSignal(
    typeof document === 'undefined'
      ? true
      : document.cookie.match(/(?:^|; )sidebar_state=([^;]*)/)?.[1] !== 'true'
  )
  const [openMobile, setOpenMobile] = createSignal(false)
  createEffect(() => {
    if (!isMobile()) setOpenMobile(false)
  })
  const mobileTriggerRef: { current: HTMLButtonElement | null } = { current: null }
  const mobileFinalFocusRef: { current: HTMLElement | null } = { current: null }
  const setCollapsed = (value: boolean) => {
    setCollapsedState(value)
    document.cookie = `sidebar_state=${!value}; path=/; max-age=${60 * 60 * 24 * 7}`
  }
  const toggleNavigation = () => {
    if (!isMobile()) return setCollapsed(!collapsed())
    if (!openMobile()) mobileFinalFocusRef.current = mobileTriggerRef.current
    setOpenMobile(!openMobile())
  }
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() === 'b' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      toggleNavigation()
    }
  }

  onMount(() => window.addEventListener('keydown', handleKeyDown))
  onCleanup(() => window.removeEventListener('keydown', handleKeyDown))

  return (
    <TooltipProvider openDelay={150}>
      <CortanaNavigationContext.Provider
        value={{
          collapsed,
          setCollapsed,
          isMobile,
          openMobile,
          setOpenMobile,
          toggleNavigation,
          mobileTriggerRef,
          mobileFinalFocusRef,
        }}
      >
        <div class="m7-shell-provider min-h-0 overflow-hidden">{props.children}</div>
      </CortanaNavigationContext.Provider>
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

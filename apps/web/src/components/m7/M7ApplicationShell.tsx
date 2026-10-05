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

import { createMediaQuery } from '@/lib/mediaQuery'
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  CircleHelp,
  ChevronDown,
  Database,
  GitFork,
  Inbox,
  Info,
  Megaphone,
  MessageCircle,
  MoreVertical,
  PanelLeftIcon,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  TerminalSquare,
} from 'lucide-solid'

import { Badge } from '@adea-ai/ui/components/ui/badge'
import { EntityIcon } from '@adea-ai/ui/components/ui/entity-icon'
import { AccountMenu, createAppMenuItems } from '@adea-ai/ui/components/composites/account-menu'
import type { AccountMenuItem } from '@adea-ai/ui/components/composites/account-menu'
import { ActionButton as Button } from '@adea-ai/ui/components/composites/action-button'
import {
  SideRail,
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
  mobileAfterCloseActionRef: { current: (() => void) | null }
  mobileAfterCloseFrameRef: { current: number | null }
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
  /** Opens About after the utilities menu closes, returning focus to its trigger. */
  onOpenAbout?: (opener?: HTMLButtonElement) => void
  /** Opens the Help Center destination. */
  onOpenHelp?: (opener?: HTMLButtonElement) => void
  /** Opens the prefilled product feedback form. */
  onOpenFeedback?: (opener?: HTMLButtonElement) => void
  /** Opens the shared updater dialog. */
  onOpenUpdates?: (opener?: HTMLButtonElement) => void
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
  /** The workspace list behind the title bar's workspace picker. */
  workspaces?: WorkspaceOption[]
  workspace?: string
  onWorkspaceChange?: (workspace: string) => void
  location: string
  systemActions?: JSX.Element
}

const navigationItems = [
  { view: 'knowledge' as const, label: 'Knowledge', icon: BookOpenText },
  { view: 'conversations' as const, label: 'Conversations', icon: MessageCircle },
]

/*
 * macOS desktop windows merge the title bar into the top bar: Tauri's Overlay
 * title bar style floats the traffic lights over the strip, so the strip
 * reserves their space and carries the window drag region. Every control in
 * the bar is a real widget, so clicks keep working; the empty track around
 * them is what drags. Browser tabs and non-mac desktop windows keep their
 * normal chrome and skip both.
 */
const macTitlebarChrome = () => isDesktopApp && navigator.userAgent.includes('Mac')

function startWindowDrag(event: PointerEvent) {
  if (event.button !== 0 || !event.isPrimary) return
  const target = event.target
  if (
    target instanceof Element &&
    target.closest(
      'button, a[href], input, textarea, select, [role="button"], [role="link"], [contenteditable="true"], [data-no-window-drag], .window-no-drag'
    )
  ) {
    return
  }
  void import('@tauri-apps/api/window')
    .then(({ getCurrentWindow }) => getCurrentWindow().startDragging())
    .catch(() => {})
}

export function M7ApplicationHeader(props: M7HeaderProps) {
  const actionsRef = { current: null as HTMLButtonElement | null }
  const [systemOpen, setSystemOpen] = createSignal(false)
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = createSignal(false)
  const navigation = useCortanaNavigation()
  const titlebar = macTitlebarChrome()
  const activeWorkspace = () => props.workspaces?.find((item) => item.id === props.workspace)
  return (
    <TopBar
      class="m7-application-header"
      glass
      draggable={false}
      macosInset={titlebar}
      onPointerDown={titlebar ? startWindowDrag : undefined}
    >
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
        {/*
         * The workspace picker lives in the title strip: the strip is the
         * window's title bar, and with the rail's own header row gone there is
         * no rail slot whose rendering context keeps this dropdown's
         * pointer-open reliable (a trigger inside the rail's scroller opens
         * and is instantly dismissed).
         */}
        <Show when={props.workspaces && props.onWorkspaceChange}>
          {/* Mobile switches workspaces through the sheet's rows; the strip
              picker yields the search cluster its width back on small
              screens. */}
          <div class="hidden md:block">
            <DropdownMenu
              modal={false}
              open={workspaceMenuOpen()}
              onOpenChange={setWorkspaceMenuOpen}
            >
              <DropdownMenuTrigger
                as={Button}
                variant="ghost"
                size="sm"
                tooltip={`Workspace: ${activeWorkspace()?.name ?? 'Choose workspace'}`}
                aria-label="Switch workspace"
              >
                <WorkspaceGlyph workspace={activeWorkspace()} size="small" />
                <span class="hidden min-w-0 max-w-40 truncate md:inline">
                  {activeWorkspace()?.name ?? 'Choose workspace'}
                </span>
                <ChevronDown aria-hidden="true" class="size-3.5 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={6} class="min-w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={props.workspace}
                    onChange={(value: unknown) => {
                      setWorkspaceMenuOpen(false)
                      props.onWorkspaceChange?.(value as string)
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
          </div>
        </Show>
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

function mobileMenuIcon(item: AccountMenuItem) {
  if (item.icon) return item.icon
  const Icon =
    item.id === 'about'
      ? Info
      : item.id === 'help'
        ? CircleHelp
        : item.id === 'feedback'
          ? Megaphone
          : item.id === 'updates'
            ? RefreshCw
            : Settings2
  return <Icon aria-hidden="true" />
}

export function M7ApplicationNavigation(props: {
  navigation: M7NavigationProps
  workspaces: WorkspaceOption[]
  workspace: string
  onWorkspaceChange: (workspace: string) => void
}) {
  const activeWorkspace = () => props.workspaces.find((item) => item.id === props.workspace)
  const currentView = () => props.navigation.view
  const utilitiesActive = () =>
    currentView() === 'index' || currentView() === 'help' || currentView() === 'settings'
  const {
    collapsed,
    isMobile,
    mobileAfterCloseActionRef,
    mobileAfterCloseFrameRef,
    mobileFinalFocusRef,
    mobileTriggerRef,
    openMobile,
    setOpenMobile,
  } = useCortanaNavigation()

  const dismissMobile = () => {
    mobileFinalFocusRef.current = mobileTriggerRef.current
    setOpenMobile(false)
  }
  const runNavigation = (action: () => void) => {
    if (!isMobile()) {
      action()
      return
    }
    mobileAfterCloseActionRef.current = action
    dismissMobile()
  }
  const dialogOpener = (opener: HTMLButtonElement | undefined) =>
    isMobile() ? (mobileTriggerRef.current ?? opener) : opener
  const menuItems = (): AccountMenuItem[] =>
    createAppMenuItems({
      primaryItem: {
        id: 'index',
        label: 'Index',
        icon: <Database aria-hidden="true" />,
        onSelectAfterClose: () => runNavigation(() => props.navigation.onNavigate('index')),
      },
      settingsShortcut: shortcutLabel('MOD,'),
      onAbout: (opener: HTMLButtonElement | undefined) =>
        runNavigation(() => props.navigation.onOpenAbout?.(dialogOpener(opener))),
      onHelp: (opener: HTMLButtonElement | undefined) =>
        runNavigation(() => {
          if (props.navigation.onOpenHelp) props.navigation.onOpenHelp(opener)
          else props.navigation.onNavigate('help')
        }),
      onFeedback: (opener: HTMLButtonElement | undefined) =>
        runNavigation(() => props.navigation.onOpenFeedback?.(opener)),
      onUpdates: (opener: HTMLButtonElement | undefined) =>
        runNavigation(() => props.navigation.onOpenUpdates?.(dialogOpener(opener))),
      onSettings: () => runNavigation(() => props.navigation.onNavigate('settings')),
    })
  const mobileMenuItemActive = (item: AccountMenuItem) =>
    (item.id === 'index' && props.navigation.view === 'index') ||
    (item.id === 'help' && props.navigation.view === 'help') ||
    (item.id === 'settings' && props.navigation.view === 'settings')
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
        <SideRailSection label="App">
          <For
            each={menuItems().filter(
              (item) => !item.platform || item.platform === (isDesktopApp ? 'desktop' : 'web')
            )}
          >
            {(item) => (
              <SideRailItem
                as="button"
                type="button"
                label={item.label}
                active={mobileMenuItemActive(item)}
                disabled={item.disabled}
                onClick={(event) => item.onSelectAfterClose?.(event.currentTarget)}
              >
                {mobileMenuIcon(item)}
              </SideRailItem>
            )}
          </For>
        </SideRailSection>
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
      </SideRailFooter>
    </SideRail>
  )

  const desktopRail = () => (
    <SideRail id="m7-primary-navigation" collapsed={collapsed()} aria-label="Primary navigation">
      {/*
       * The window's title strip spans the full width above this rail, and the
       * workspace picker lives in that strip (see M7ApplicationHeader): the
       * rail carries destinations only.
       */}
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
        <AccountMenu
          items={menuItems()}
          platform={isDesktopApp ? 'desktop' : 'web'}
          authenticated={false}
          showSession={false}
          label="Settings and utilities"
          railTrigger
          placement="right-end"
          gutter={4}
          hideArrow
          data-active={utilitiesActive() ? '' : undefined}
        />
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
            if (mobileAfterCloseActionRef.current) {
              let attempts = 0
              const startedAt = Date.now()
              const runWhenAvailable = () => {
                mobileAfterCloseFrameRef.current = null
                if (!mobileAfterCloseActionRef.current) return
                const trigger = mobileTriggerRef.current
                if (
                  !openMobile() &&
                  trigger?.isConnected &&
                  !trigger.matches(':disabled') &&
                  !trigger.closest('[inert], [aria-hidden="true"]')
                ) {
                  const action = mobileAfterCloseActionRef.current
                  mobileAfterCloseActionRef.current = null
                  action()
                  return
                }
                if (++attempts >= 60 || Date.now() - startedAt >= 1_000) {
                  mobileAfterCloseActionRef.current = null
                  return
                }
                mobileAfterCloseFrameRef.current = window.requestAnimationFrame(runWhenAvailable)
              }
              mobileAfterCloseFrameRef.current = window.requestAnimationFrame(runWhenAvailable)
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
  const mobileAfterCloseActionRef: { current: (() => void) | null } = { current: null }
  const mobileAfterCloseFrameRef: { current: number | null } = { current: null }
  onCleanup(() => {
    mobileAfterCloseActionRef.current = null
    if (mobileAfterCloseFrameRef.current !== null) {
      window.cancelAnimationFrame(mobileAfterCloseFrameRef.current)
      mobileAfterCloseFrameRef.current = null
    }
  })
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
          mobileAfterCloseActionRef,
          mobileAfterCloseFrameRef,
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

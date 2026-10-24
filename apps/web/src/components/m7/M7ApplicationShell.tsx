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
  Database,
  GitFork,
  Inbox,
  Info,
  Megaphone,
  MessageCircle,
  MoreVertical,
  PanelLeftClose,
  PanelLeftOpen,
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
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@adea-ai/ui/components/ui/popover'
import { Activity } from 'lucide-solid'
import { ShellRail } from '@adea-ai/ui/components/layout/shell-rail'
import { ShellTopBar } from '@adea-ai/ui/components/layout/shell-top-bar'
import { WorkspaceSwitcher } from '@adea-ai/ui/components/composites/workspace-switcher'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '@adea-ai/ui/components/ui/breadcrumb'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import { systemStatusAnchorRect } from '@/components/m7/systemStatusAnchor'
import type { M7ActivityInbox } from '@/components/m7/M7ActivityInbox'
import type { M7CommandPalette } from '@/components/m7/M7CommandPalette'
import { WorkspaceLogo } from '@/workspaceLogos'

type WorkspaceOption = { id: string; name: string; color: string | null }

type CortanaNavigationValue = {
  /** Whether the Sources sidebar is open at wide widths. */
  sidebarOpen: () => boolean
  setSidebarOpen: (open: boolean) => void
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

export type AppView = 'knowledge' | 'settings' | 'inbox' | 'conversations' | 'agent-tools' | 'index'

export type M7NavigationProps = {
  view: AppView
  workspaceTab?: 'answer' | 'document' | 'sources' | 'graph' | 'timeline'
  onNavigate: (view: AppView) => void
  onOpenGraph: () => void
  /** Opens About after the utilities menu closes, returning focus to its trigger. */
  onOpenAbout?: (opener?: HTMLButtonElement) => void
  /** Opens the Help Center dialog after the utilities menu closes. */
  onOpenHelp?: (opener?: HTMLButtonElement) => void
  /** Opens the prefilled product feedback form. */
  onOpenFeedback?: (opener?: HTMLButtonElement) => void
  /** Opens the shared updater dialog. */
  onOpenUpdates?: (opener?: HTMLButtonElement) => void
  /** Moves focus to the knowledge search, the rail's search entry point. */
  onSearch?: () => void
}

export type M7HeaderProps = {
  query: string
  loading: boolean
  searchRef: { current: HTMLInputElement | null }
  /** The menu trigger that holds the search box; the focus fallback while the menu is closed. */
  searchTriggerRef: { current: HTMLElement | null }
  /** Whether the top bar's search menu (search box and Reflect) is open. */
  searchOpen: boolean
  onSearchOpenChange: (open: boolean) => void
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
  /** The workspace list behind the title bar's workspace switcher. */
  workspaces?: WorkspaceOption[]
  workspace?: string
  onWorkspaceChange?: (workspace: string) => void
  /** Opens the Workspaces settings, offered from the switcher's menu. */
  onManageWorkspaces?: () => void
  /**
   * Whether the active view has a sidebar for the toggle to control. Views
   * without one (conversations, inbox, settings, the full-screen graph) hide
   * the toggle on wide windows; narrow windows keep it for the navigation drawer.
   */
  hasSidebar: boolean
  /** The Sources sidebar's width in pixels, so the top bar's divider lands on its edge. */
  sidebarWidth?: number
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
  const [statusTrigger, setStatusTrigger] = createSignal<HTMLElement>()
  const navigation = useCortanaNavigation()
  const titlebar = macTitlebarChrome()
  // Wide windows toggle the Sources sidebar; narrow ones open the navigation
  // drawer, which is the only way to reach the rail's destinations there.
  const toggleVisible = () => navigation.isMobile() || props.hasSidebar
  const sidebarExpanded = () =>
    navigation.isMobile() ? navigation.openMobile() : navigation.sidebarOpen()
  const toggleLabel = () =>
    navigation.isMobile()
      ? 'Toggle navigation'
      : navigation.sidebarOpen()
        ? 'Collapse sidebar'
        : 'Expand sidebar'
  return (
    <ShellTopBar
      draggable={false}
      macosInset={titlebar}
      onPointerDown={titlebar ? startWindowDrag : undefined}
      sidebarOpen={!navigation.isMobile() && props.hasSidebar && navigation.sidebarOpen()}
      sidebarWidth={props.sidebarWidth}
      navigation={
        <Show when={!navigation.isMobile()}>
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
        </Show>
      }
      sidebarToggle={
        <Show when={toggleVisible()}>
          <Button
            tooltip={toggleLabel()}
            ref={(element: HTMLButtonElement) => (navigation.mobileTriggerRef.current = element)}
            variant="ghost"
            size="icon-sm"
            aria-label={toggleLabel()}
            aria-expanded={sidebarExpanded()}
            aria-controls={navigation.isMobile() ? 'm7-primary-navigation' : 'm7-sources-sidebar'}
            onClick={navigation.toggleNavigation}
          >
            <Show
              when={navigation.isMobile()}
              fallback={
                <Show
                  when={navigation.sidebarOpen()}
                  fallback={<PanelLeftOpen aria-hidden="true" />}
                >
                  <PanelLeftClose aria-hidden="true" />
                </Show>
              }
            >
              <PanelLeftIcon aria-hidden="true" />
            </Show>
          </Button>
        </Show>
      }
      workspace={
        // Mobile switches workspaces through the drawer's rows; the strip
        // switcher yields the search its width back on small screens.
        <Show when={props.workspaces && props.onWorkspaceChange && !navigation.isMobile()}>
          <WorkspaceSwitcher
            value={props.workspace}
            workspaces={(props.workspaces ?? []).map((item) => ({
              id: item.id,
              name: item.name,
              mark: <WorkspaceLogo workspace={item} size="small" />,
            }))}
            onValueChange={(id) => props.onWorkspaceChange?.(id)}
            onManage={props.onManageWorkspaces}
            manageLabel="Manage workspaces…"
            label="Workspaces"
          />
        </Show>
      }
      breadcrumb={
        <Show when={!navigation.isMobile()}>
          <Breadcrumb class="hidden min-w-0 lg:block">
            <BreadcrumbList class="flex-nowrap">
              <BreadcrumbItem class="min-w-0">
                <BreadcrumbPage class="min-w-0">
                  <span class="block truncate">{props.location}</span>
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </Show>
      }
      actions={
        <>
          <Popover
            open={props.searchOpen}
            onOpenChange={props.onSearchOpenChange}
            placement="bottom-end"
          >
            <PopoverTrigger
              as={Button}
              ref={(el: HTMLButtonElement) => (props.searchTriggerRef.current = el)}
              variant="ghost"
              size="icon-sm"
              aria-label="Search and reflect"
              aria-keyshortcuts="Control+K Meta+K"
              tooltip={`Search your knowledge or reflect on this objective (${shortcutLabel('MOD K')}).`}
            >
              <Show when={props.loading} fallback={<Search aria-hidden="true" />}>
                <Spinner size="md" label="Searching" />
              </Show>
            </PopoverTrigger>
            <PopoverContent class="w-96 max-w-full" aria-label="Search and reflect">
              <PopoverTitle>Search</PopoverTitle>
              <form
                class="flex min-w-0 flex-col gap-2"
                onSubmit={(event) => {
                  props.onSubmit(event)
                  props.onSearchOpenChange(false)
                }}
              >
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
                    <Show when={!navigation.isMobile()}>
                      <Kbd>{shortcutLabel('MOD K')}</Kbd>
                    </Show>
                  </InputGroupAddon>
                </InputGroup>
                <Button
                  tooltip="Reflect on this objective"
                  type="button"
                  size="xs"
                  class="self-end"
                  aria-label="Reflect on this objective"
                  onClick={() => {
                    props.onReflect()
                    props.onSearchOpenChange(false)
                  }}
                  disabled={props.loading || !props.query.trim()}
                >
                  <Sparkles aria-hidden="true" />
                  <span>Reflect</span>
                </Button>
              </form>
            </PopoverContent>
          </Popover>
          <Show when={props.systemActions}>
            <Popover
              open={systemOpen()}
              onOpenChange={setSystemOpen}
              anchorRef={() =>
                statusTrigger()?.closest<HTMLElement>('[data-slot="shell-top-bar"]') ?? undefined
              }
              getAnchorRect={(bar) => systemStatusAnchorRect(statusTrigger(), bar)}
            >
              <PopoverTrigger
                as={Button}
                ref={setStatusTrigger}
                variant="ghost"
                size="icon-sm"
                aria-label="System status"
                tooltip="Review source jobs, service health, installation, and update status."
              >
                <Activity aria-hidden="true" />
              </PopoverTrigger>
              <PopoverContent
                class="system-status-popover max-w-full"
                aria-label="System status details"
                onClick={(event: MouseEvent) => {
                  if ((event.target as HTMLElement).closest('button, a')) setSystemOpen(false)
                }}
              >
                <PopoverTitle>System status</PopoverTitle>
                <div class="flex flex-col items-start gap-2">{props.systemActions}</div>
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
                <DropdownMenuItem onSelect={props.onOpenHistory}>
                  Open conversations
                </DropdownMenuItem>
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
                <DropdownMenuItem
                  keyshortcuts="Control+P Meta+P"
                  onSelect={() => props.onOpenCommands(actionsRef.current)}
                >
                  Command palette
                  <DropdownMenuShortcut>{shortcutLabel('MOD P')}</DropdownMenuShortcut>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    />
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
          size="panel"
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
  const utilitiesActive = () => currentView() === 'index' || currentView() === 'settings'
  const {
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
        runNavigation(() => props.navigation.onOpenHelp?.(dialogOpener(opener))),
      onFeedback: (opener: HTMLButtonElement | undefined) =>
        runNavigation(() => props.navigation.onOpenFeedback?.(opener)),
      onUpdates: (opener: HTMLButtonElement | undefined) =>
        runNavigation(() => props.navigation.onOpenUpdates?.(dialogOpener(opener))),
      onSettings: () => runNavigation(() => props.navigation.onNavigate('settings')),
    })
  const mobileMenuItemActive = (item: AccountMenuItem) =>
    (item.id === 'index' && props.navigation.view === 'index') ||
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
    <ShellRail
      id="m7-primary-navigation"
      aria-label="Primary navigation"
      mark={<img src="/app-icon.svg" alt="" class="size-9" />}
      onSearch={props.navigation.onSearch}
      searchLabel="Search knowledge"
      searchKeyshortcuts="Meta+K Control+K"
      searchKeys={shortcutLabel('MOD K').split(' ')}
      footer={
        <>
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
            label="User settings"
            railTrigger
            placement="right-end"
            gutter={4}
            hideArrow
            data-active={utilitiesActive() ? '' : undefined}
          />
        </>
      }
    >
      {destinations()}
    </ShellRail>
  )

  return (
    <>
      <Show when={!isMobile()}>{desktopRail()}</Show>
      <Sheet open={openMobile()} onOpenChange={setOpenMobile}>
        <SheetContent
          data-mobile="true"
          side="start"
          closeButton={false}
          class="w-72 max-w-full"
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

export function M7ShellProvider(props: {
  children: JSX.Element
  /** Whether the Sources sidebar is open on wide windows; the host persists it. */
  sidebarOpen: () => boolean
  onSidebarOpenChange: (open: boolean) => void
}) {
  const isMobile = createMediaQuery(() => '(max-width: 799px)')
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
  // Wide windows collapse the Sources sidebar (the rail is always the icon
  // column); narrow windows open the navigation drawer.
  const toggleNavigation = () => {
    if (!isMobile()) return props.onSidebarOpenChange(!props.sidebarOpen())
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
          sidebarOpen: props.sidebarOpen,
          setSidebarOpen: props.onSidebarOpenChange,
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

import {
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  Show,
  splitProps,
  type ComponentProps,
} from 'solid-js'
import { Dynamic, Portal } from 'solid-js/web'
import type { ValidComponent } from 'solid-js'
import type { VariantProps } from 'class-variance-authority'

import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { Button } from '@/components/shadcn/button'
import { Input } from '@/components/shadcn/input'
import { Separator } from '@/components/shadcn/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/shadcn/sheet'
import { Skeleton } from '@/components/shadcn/skeleton'
import { PanelLeftIcon } from 'lucide-solid'
import { SidebarContext, type SidebarContextProps, useSidebar } from './sidebar-context'
import { sidebarMenuButtonVariants } from './sidebar-variants'

const SIDEBAR_COOKIE_NAME = 'sidebar_state'
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const SIDEBAR_WIDTH = '16rem'
const SIDEBAR_WIDTH_MOBILE = '18rem'
const SIDEBAR_WIDTH_ICON = '3rem'
const SIDEBAR_KEYBOARD_SHORTCUT = 'b'

function SidebarProvider(
  props: ComponentProps<'div'> & {
    defaultOpen?: boolean
    open?: boolean
    onOpenChange?: (open: boolean) => void
  }
) {
  const [local, rest] = splitProps(props, [
    'defaultOpen',
    'open',
    'onOpenChange',
    'class',
    'style',
    'children',
  ])
  const isMobile = useIsMobile()
  const [openMobile, setOpenMobile] = createSignal(false)
  const mobileTriggerRef: { current: HTMLButtonElement | null } = { current: null }
  const mobileFinalFocusRef: { current: HTMLElement | null } = { current: null }

  const [_open, _setOpen] = createSignal(local.defaultOpen ?? true)
  const open = () => local.open ?? _open()
  const setOpen = (value: boolean | ((value: boolean) => boolean)) => {
    const openState = typeof value === 'function' ? value(open()) : value
    if (local.onOpenChange) {
      local.onOpenChange(openState)
    } else {
      _setOpen(openState)
    }

    document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
  }

  const toggleSidebar = () => {
    if (!isMobile()) return setOpen((isOpen) => !isOpen)
    if (!openMobile()) mobileFinalFocusRef.current = mobileTriggerRef.current
    setOpenMobile(!openMobile())
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      toggleSidebar()
    }
  }

  onMount(() => window.addEventListener('keydown', handleKeyDown))
  onCleanup(() => window.removeEventListener('keydown', handleKeyDown))

  const state = () => (open() ? 'expanded' : 'collapsed')

  const contextValue: SidebarContextProps = {
    state,
    open,
    setOpen,
    isMobile,
    openMobile,
    setOpenMobile,
    toggleSidebar,
    mobileTriggerRef,
    mobileFinalFocusRef,
  }

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        data-slot="sidebar-wrapper"
        style={{
          '--sidebar-width': SIDEBAR_WIDTH,
          '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
          ...(typeof local.style === 'object' ? local.style : {}),
        }}
        class={cn(
          'group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar',
          local.class
        )}
        {...rest}
      >
        {local.children}
      </div>
    </SidebarContext.Provider>
  )
}

function Sidebar(
  props: ComponentProps<'div'> & {
    side?: 'left' | 'right'
    variant?: 'sidebar' | 'floating' | 'inset'
    collapsible?: 'offcanvas' | 'icon' | 'none'
  }
) {
  const [local, rest] = splitProps(props, [
    'side',
    'variant',
    'collapsible',
    'class',
    'children',
    'dir',
    'role',
    'aria-label',
  ])
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar()

  return (
    <Show
      when={local.collapsible !== 'none'}
      fallback={
        <div
          data-slot="sidebar"
          class={cn(
            'flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground',
            local.class
          )}
          {...rest}
        >
          {local.children}
        </div>
      }
    >
      <Show
        when={!isMobile()}
        fallback={
          <Sheet open={openMobile()} onOpenChange={setOpenMobile} {...rest}>
            <SheetContent
              dir={local.dir}
              data-sidebar="sidebar"
              data-slot="sidebar"
              data-mobile="true"
              class="w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
              style={{ '--sidebar-width': SIDEBAR_WIDTH_MOBILE }}
              side={local.side ?? 'left'}
            >
              <SheetHeader class="sr-only">
                <SheetTitle>Sidebar</SheetTitle>
                <SheetDescription>Displays the mobile sidebar.</SheetDescription>
              </SheetHeader>
              <div
                class="flex h-full w-full flex-col"
                role={local.role}
                aria-label={local['aria-label']}
              >
                {local.children}
              </div>
            </SheetContent>
          </Sheet>
        }
      >
        <div
          class="group peer hidden text-sidebar-foreground md:block"
          data-state={state()}
          data-collapsible={state() === 'collapsed' ? (local.collapsible ?? 'offcanvas') : ''}
          data-variant={local.variant ?? 'sidebar'}
          data-side={local.side ?? 'left'}
          data-slot="sidebar"
        >
          {/* This is what handles the sidebar gap on desktop */}
          <div
            data-slot="sidebar-gap"
            class={cn(
              'relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear',
              'group-data-[collapsible=offcanvas]:w-0',
              'group-data-[side=right]:rotate-180',
              (local.variant ?? 'sidebar') === 'floating' || local.variant === 'inset'
                ? 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]'
                : 'group-data-[collapsible=icon]:w-(--sidebar-width-icon)'
            )}
          />
          <div
            data-slot="sidebar-container"
            data-side={local.side ?? 'left'}
            role={local.role}
            aria-label={local['aria-label']}
            class={cn(
              'fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear data-[side=left]:left-0 data-[side=left]:group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)] data-[side=right]:right-0 data-[side=right]:group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)] md:flex',
              (local.variant ?? 'sidebar') === 'floating' || local.variant === 'inset'
                ? 'p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]'
                : 'group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l',
              local.class
            )}
            {...rest}
          >
            <div
              data-sidebar="sidebar"
              data-slot="sidebar-inner"
              class="flex size-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:shadow-sm group-data-[variant=floating]:ring-1 group-data-[variant=floating]:ring-sidebar-border"
            >
              {local.children}
            </div>
          </div>
        </div>
      </Show>
    </Show>
  )
}

function SidebarTrigger(props: ComponentProps<typeof Button>) {
  const [local, rest] = splitProps(props, ['class', 'onClick', 'ref'])
  const { mobileTriggerRef, toggleSidebar } = useSidebar()

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon-sm"
      ref={(node: HTMLButtonElement) => {
        mobileTriggerRef.current = node
        if (typeof local.ref === 'function') local.ref(node)
        else if (local.ref) (local.ref as { current: HTMLButtonElement }).current = node
      }}
      class={cn(local.class)}
      onClick={(event: MouseEvent) => {
        if (typeof local.onClick === 'function') local.onClick(event)
        toggleSidebar()
      }}
      {...rest}
    >
      <PanelLeftIcon />
      <span class="sr-only">Toggle Sidebar</span>
    </Button>
  )
}

function SidebarRail(props: ComponentProps<'button'>) {
  const [local, rest] = splitProps(props, ['class'])
  const { toggleSidebar } = useSidebar()

  return (
    <button
      data-sidebar="rail"
      data-slot="sidebar-rail"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      class={cn(
        'absolute inset-y-0 z-20 hidden w-4 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:start-1/2 after:w-[2px] hover:after:bg-sidebar-border sm:flex ltr:-translate-x-1/2 rtl:-translate-x-1/2',
        'in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize',
        '[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize',
        'group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full hover:group-data-[collapsible=offcanvas]:bg-sidebar',
        '[[data-side=left][data-collapsible=offcanvas]_&]:-right-2',
        '[[data-side=right][data-collapsible=offcanvas]_&]:-left-2',
        local.class
      )}
      {...rest}
    />
  )
}

function SidebarInset(props: ComponentProps<'main'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <main
      data-slot="sidebar-inset"
      class={cn(
        'relative flex w-full flex-1 flex-col bg-background md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2',
        local.class
      )}
      {...rest}
    />
  )
}

function SidebarInput(props: ComponentProps<typeof Input>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <Input
      data-slot="sidebar-input"
      data-sidebar="input"
      class={cn('h-8 w-full bg-background shadow-none', local.class)}
      {...rest}
    />
  )
}

function SidebarHeader(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      class={cn('flex flex-col gap-2 p-2', local.class)}
      {...rest}
    />
  )
}

function SidebarFooter(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      class={cn('flex flex-col gap-2 p-2', local.class)}
      {...rest}
    />
  )
}

function SidebarSeparator(props: ComponentProps<typeof Separator>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      class={cn('mx-2 w-auto bg-sidebar-border', local.class)}
      {...rest}
    />
  )
}

function SidebarContent(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      class={cn(
        'no-scrollbar flex min-h-0 flex-1 flex-col gap-0 overflow-auto group-data-[collapsible=icon]:overflow-hidden',
        local.class
      )}
      {...rest}
    />
  )
}

function SidebarGroup(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      class={cn('relative flex w-full min-w-0 flex-col p-2', local.class)}
      {...rest}
    />
  )
}

function SidebarGroupLabel(props: ComponentProps<'div'> & { as?: ValidComponent }) {
  const [local, rest] = splitProps(props, ['class', 'as'])
  return (
    <Dynamic
      component={local.as ?? 'div'}
      data-slot="sidebar-group-label"
      data-sidebar="group-label"
      class={cn(
        'flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground ring-sidebar-ring outline-hidden transition-[margin,opacity] duration-200 ease-linear group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0 focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',
        local.class
      )}
      {...rest}
    />
  )
}

function SidebarGroupAction(props: ComponentProps<'button'> & { as?: ValidComponent }) {
  const [local, rest] = splitProps(props, ['class', 'as'])
  return (
    <Dynamic
      component={local.as ?? 'button'}
      data-slot="sidebar-group-action"
      data-sidebar="group-action"
      class={cn(
        'absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform group-data-[collapsible=icon]:hidden after:absolute after:-inset-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0',
        local.class
      )}
      {...rest}
    />
  )
}

function SidebarGroupContent(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      class={cn('w-full text-sm', local.class)}
      {...rest}
    />
  )
}

function SidebarMenu(props: ComponentProps<'ul'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      class={cn('flex w-full min-w-0 flex-col gap-0', local.class)}
      {...rest}
    />
  )
}

function SidebarMenuItem(props: ComponentProps<'li'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      class={cn('group/menu-item relative', local.class)}
      {...rest}
    />
  )
}

/** Collapsed-rail label geometry: the anchor row's viewport box. */
type SidebarHintRect = { top: number; left: number; height: number }

// Rows composed as a menu trigger arrive with the trigger's own handlers on the
// same props. Solid accepts either a plain handler or a data-bound tuple, and
// the rail must not swallow the caller's, so relay both shapes.
function relayHandler(handler: unknown, event: Event) {
  if (typeof handler === 'function') (handler as (event: Event) => void)(event)
  else if (Array.isArray(handler))
    (handler[0] as (data: unknown, event: Event) => void)(handler[1], event)
}

function SidebarMenuButton(
  props: ComponentProps<'button'> & {
    as?: ValidComponent
    isActive?: boolean
    /** Row icon; also drawn inside the collapsed label so the two match. */
    icon?: ValidComponent
    /** Collapsed-rail label text. */
    tooltip?: string
  } & VariantProps<typeof sidebarMenuButtonVariants>
) {
  const { isMobile, state } = useSidebar()
  const [local, rest] = splitProps(props, [
    'class',
    'as',
    'isActive',
    'icon',
    'variant',
    'size',
    'tooltip',
    'children',
    'onMouseEnter',
    'onMouseLeave',
    'onFocus',
    'onBlur',
  ])
  const hintEnabled = () => Boolean(local.tooltip) && !isMobile() && state() === 'collapsed'
  // The collapsed rail's hover affordance is the row unfolding in place: the
  // label overlays the row's exact box (same top, left, and height) and carries
  // the same icon, so the rail keeps one surface instead of a pointer bubble
  // parked beside it. Portalled because the rail scrolls and would clip an
  // in-flow child, and repositioned while shown so it follows that scroll.
  const [hintRect, setHintRect] = createSignal<SidebarHintRect | null>(null)
  const [hintVisible, setHintVisible] = createSignal(false)
  let hintAnchor: HTMLElement | null = null
  let hideTimer: ReturnType<typeof setTimeout> | undefined
  let frame: number | undefined

  const cancelTimers = () => {
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = undefined
    }
    if (frame !== undefined) {
      cancelAnimationFrame(frame)
      frame = undefined
    }
  }
  const placeHint = () => {
    if (!hintAnchor) return
    const box = hintAnchor.getBoundingClientRect()
    const next = { top: box.top, left: box.left, height: box.height }
    setHintRect((previous) =>
      previous &&
      previous.top === next.top &&
      previous.left === next.left &&
      previous.height === next.height
        ? previous
        : next
    )
  }
  const showHint = (anchor: HTMLElement) => {
    if (!hintEnabled()) return
    hintAnchor = anchor
    cancelTimers()
    placeHint()
    frame = requestAnimationFrame(() => {
      frame = undefined
      setHintVisible(true)
    })
  }
  const hideHint = () => {
    cancelTimers()
    hintAnchor = null
    setHintVisible(false)
    // Keeps the node mounted through the fade-out before it is dropped.
    hideTimer = setTimeout(() => setHintRect(null), 150)
  }
  // Expanding the rail (or switching to mobile) while a label is up must drop
  // it: the row now shows its own text, and mouseleave may never arrive.
  createEffect(() => {
    if (hintEnabled()) return
    cancelTimers()
    hintAnchor = null
    setHintVisible(false)
    setHintRect(null)
  })
  createEffect(() => {
    if (!hintRect()) return
    window.addEventListener('scroll', placeHint, true)
    window.addEventListener('resize', placeHint)
    onCleanup(() => {
      window.removeEventListener('scroll', placeHint, true)
      window.removeEventListener('resize', placeHint)
    })
  })
  onCleanup(cancelTimers)

  const renderButton = () => (
    <Dynamic
      component={local.as ?? 'button'}
      data-sidebar="menu-button"
      data-size={local.size ?? 'default'}
      data-active={local.isActive || undefined}
      class={cn(
        sidebarMenuButtonVariants({ variant: local.variant, size: local.size }),
        local.class
      )}
      {...rest}
      // The row owns its own identity: when a caller composes this button as a
      // menu trigger, the trigger's `data-slot` must not replace the rail row's.
      data-slot="sidebar-menu-button"
      // Pointer and keyboard both reveal the label: the rail is icon-only, so
      // hover alone would leave the names unreachable without a mouse.
      onMouseEnter={(event: MouseEvent) => {
        relayHandler(local.onMouseEnter, event)
        showHint(event.currentTarget as HTMLElement)
      }}
      onMouseLeave={(event: MouseEvent) => {
        relayHandler(local.onMouseLeave, event)
        hideHint()
      }}
      onFocus={(event: FocusEvent) => {
        relayHandler(local.onFocus, event)
        showHint(event.currentTarget as HTMLElement)
      }}
      onBlur={(event: FocusEvent) => {
        relayHandler(local.onBlur, event)
        hideHint()
      }}
    >
      <Show when={local.icon}>{(icon) => <Dynamic component={icon()} aria-hidden="true" />}</Show>
      {local.children}
    </Dynamic>
  )

  return (
    <>
      {renderButton()}
      <Show when={hintRect()}>
        <Portal>
          <div
            data-slot="sidebar-menu-hint"
            aria-hidden="true"
            class={cn(
              'pointer-events-none fixed z-[9999] flex items-center gap-2.5 rounded-md border border-border bg-card pr-3 pl-3 text-sm font-medium whitespace-nowrap text-foreground shadow-lg transition-opacity duration-150',
              hintVisible() ? 'opacity-100' : 'opacity-0'
            )}
            style={{
              top: `${hintRect()!.top}px`,
              left: `${hintRect()!.left}px`,
              height: `${hintRect()!.height}px`,
            }}
          >
            <Show when={local.icon}>
              {(icon) => (
                <span
                  class={cn(
                    'flex size-6 shrink-0 items-center justify-center',
                    local.isActive && 'text-sidebar-primary'
                  )}
                >
                  <Dynamic component={icon()} aria-hidden="true" />
                </span>
              )}
            </Show>
            {local.tooltip}
          </div>
        </Portal>
      </Show>
    </>
  )
}

function SidebarMenuAction(
  props: ComponentProps<'button'> & {
    as?: ValidComponent
    showOnHover?: boolean
  }
) {
  const [local, rest] = splitProps(props, ['class', 'as', 'showOnHover'])
  return (
    <Dynamic
      component={local.as ?? 'button'}
      data-slot="sidebar-menu-action"
      data-sidebar="menu-action"
      class={cn(
        'absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform group-data-[collapsible=icon]:hidden peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1 after:absolute after:-inset-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0',
        local.showOnHover &&
          'group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 peer-data-[active]/menu-button:text-sidebar-accent-foreground aria-expanded:opacity-100 md:opacity-0',
        local.class
      )}
      {...rest}
    />
  )
}

function SidebarMenuBadge(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <div
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      class={cn(
        'pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium text-sidebar-foreground tabular-nums select-none group-data-[collapsible=icon]:hidden peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1 peer-data-[active]/menu-button:text-sidebar-accent-foreground',
        local.class
      )}
      {...rest}
    />
  )
}

function SidebarMenuSkeleton(
  props: ComponentProps<'div'> & {
    showIcon?: boolean
  }
) {
  const [local, rest] = splitProps(props, ['class', 'showIcon'])
  const width = `${Math.floor(Math.random() * 40) + 50}%`

  return (
    <div
      data-slot="sidebar-menu-skeleton"
      data-sidebar="menu-skeleton"
      class={cn('flex h-8 items-center gap-2 rounded-md px-2', local.class)}
      {...rest}
    >
      <Show when={local.showIcon}>
        <Skeleton class="size-4 rounded-md" data-sidebar="menu-skeleton-icon" />
      </Show>
      <Skeleton
        class="h-4 max-w-(--skeleton-width) flex-1"
        data-sidebar="menu-skeleton-text"
        style={{ '--skeleton-width': width }}
      />
    </div>
  )
}

function SidebarMenuSub(props: ComponentProps<'ul'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <ul
      data-slot="sidebar-menu-sub"
      data-sidebar="menu-sub"
      class={cn(
        'mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5 group-data-[collapsible=icon]:hidden',
        local.class
      )}
      {...rest}
    />
  )
}

function SidebarMenuSubItem(props: ComponentProps<'li'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <li
      data-slot="sidebar-menu-sub-item"
      data-sidebar="menu-sub-item"
      class={cn('group/menu-sub-item relative', local.class)}
      {...rest}
    />
  )
}

function SidebarMenuSubButton(
  props: ComponentProps<'a'> & {
    as?: ValidComponent
    size?: 'sm' | 'md'
    isActive?: boolean
  }
) {
  const [local, rest] = splitProps(props, ['class', 'as', 'size', 'isActive'])
  return (
    <Dynamic
      component={local.as ?? 'a'}
      data-slot="sidebar-menu-sub-button"
      data-sidebar="menu-sub-button"
      data-size={local.size ?? 'md'}
      data-active={local.isActive || undefined}
      class={cn(
        'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden group-data-[collapsible=icon]:hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[size=md]:text-sm data-[size=sm]:text-xs data-[active]:bg-sidebar-accent data-[active]:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-accent-foreground',
        local.class
      )}
      {...rest}
    />
  )
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
}

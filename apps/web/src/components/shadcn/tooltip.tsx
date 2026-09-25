import { Tooltip as TooltipPrimitive } from '@kobalte/core/tooltip'
import {
  createContext,
  createSignal,
  splitProps,
  useContext,
  type ComponentProps,
  type JSX,
  type Setter,
} from 'solid-js'
import type { PopperRootProps } from '@kobalte/core/popper'

import { cn } from '@/lib/utils'

type PlacementOptions = Pick<PopperRootProps, 'placement' | 'gutter' | 'shift'>

type Side = 'top' | 'right' | 'bottom' | 'left'
type Align = 'start' | 'center' | 'end'

function toPlacement(side?: Side, align?: Align): PlacementOptions['placement'] {
  if (!side) return undefined
  return align === 'start' || align === 'end' ? `${side}-${align}` : side
}

const TooltipPlacementContext = createContext<Setter<PlacementOptions>>()
const TooltipDelayContext = createContext<number>()

function TooltipProvider(props: { delay?: number; children?: JSX.Element }) {
  return (
    <TooltipDelayContext.Provider value={props.delay}>
      {props.children}
    </TooltipDelayContext.Provider>
  )
}

function Tooltip(
  props: ComponentProps<typeof TooltipPrimitive> & {
    delay?: number
    side?: Side
    align?: Align
    sideOffset?: number
    alignOffset?: number
  }
) {
  const [local, rest] = splitProps(props, [
    'delay',
    'side',
    'align',
    'sideOffset',
    'alignOffset',
    'children',
  ])
  const providerDelay = useContext(TooltipDelayContext)
  const [placement, setPlacement] = createSignal<PlacementOptions>({
    placement: toPlacement(local.side, local.align),
    gutter: local.sideOffset,
    shift: local.alignOffset,
  })

  return (
    <TooltipPlacementContext.Provider value={setPlacement}>
      <TooltipPrimitive
        data-slot="tooltip"
        openDelay={local.delay ?? providerDelay ?? 0}
        placement={placement().placement}
        gutter={placement().gutter}
        shift={placement().shift}
        {...rest}
      >
        {local.children}
      </TooltipPrimitive>
    </TooltipPlacementContext.Provider>
  )
}

function TooltipTrigger(props: ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent(
  props: ComponentProps<typeof TooltipPrimitive.Content> & {
    side?: Side
    align?: Align
    sideOffset?: number
    alignOffset?: number
  }
) {
  const [local, rest] = splitProps(props, [
    'class',
    'side',
    'align',
    'sideOffset',
    'alignOffset',
    'children',
  ])
  // Kobalte positions the tooltip on the root; bridge the Base UI-style
  // placement props accepted here up to it.
  const setPlacement = useContext(TooltipPlacementContext)
  if (setPlacement && (local.side || local.align || local.sideOffset || local.alignOffset)) {
    setPlacement({
      placement: toPlacement(local.side, local.align),
      gutter: local.sideOffset,
      shift: local.alignOffset,
    })
  }
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        class={cn(
          // Same floating-surface vocabulary as the dropdown menu: elevated
          // popover surface, hairline ring, short fade. Deliberately no arrow —
          // the anchor already makes the pointer obvious, and the rotated
          // square read as a stray artifact on themed panels.
          'z-50 inline-flex w-fit max-w-xs origin-(--kb-tooltip-content-transform-origin) items-center gap-1.5 rounded-md bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-expanded:animate-in data-expanded:fade-in-0 data-expanded:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
          local.class
        )}
        {...rest}
      >
        {local.children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }

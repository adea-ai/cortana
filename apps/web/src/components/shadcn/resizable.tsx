import { createContext, splitProps, useContext, type ComponentProps } from 'solid-js'

import { cn } from '@/lib/utils'

type Direction = 'horizontal' | 'vertical'

const ResizableContext = createContext<{ direction: () => Direction }>()

function ResizablePanelGroup(
  props: ComponentProps<'div'> & {
    direction?: Direction
  }
) {
  const [local, rest] = splitProps(props, ['class', 'direction'])
  const direction = () => local.direction ?? 'horizontal'
  return (
    <ResizableContext.Provider value={{ direction }}>
      <div
        data-slot="resizable-panel-group"
        data-orientation={direction()}
        class={cn('flex h-full w-full data-[orientation=vertical]:flex-col', local.class)}
        {...rest}
      />
    </ResizableContext.Provider>
  )
}

function ResizablePanel(
  props: ComponentProps<'div'> & {
    defaultSize?: number
    minSize?: number
    maxSize?: number
  }
) {
  const [local, rest] = splitProps(props, ['class', 'style', 'defaultSize', 'minSize', 'maxSize'])
  return (
    <div
      data-slot="resizable-panel"
      style={{
        ...(typeof local.style === 'object' ? local.style : undefined),
        flex: local.defaultSize !== undefined ? `${local.defaultSize} 1 0%` : undefined,
      }}
      class={cn('min-w-0 min-h-0', local.class)}
      {...rest}
    />
  )
}

function ResizableHandle(
  props: ComponentProps<'div'> & {
    withHandle?: boolean
    disabled?: boolean
  }
) {
  const [local, rest] = splitProps(props, [
    'class',
    'withHandle',
    'disabled',
    'onPointerDown',
    'onKeyDown',
  ])
  const context = useContext(ResizableContext)

  const onPointerDown = (
    event: PointerEvent & { currentTarget: HTMLDivElement; target: Element }
  ) => {
    if (typeof local.onPointerDown === 'function') local.onPointerDown(event)
    if (local.disabled) return
    const handle = event.currentTarget
    const direction = context?.direction() ?? 'horizontal'
    const prev = handle.previousElementSibling as HTMLElement | null
    const next = handle.nextElementSibling as HTMLElement | null
    const group = handle.parentElement
    if (!prev || !next || !group) return

    event.preventDefault()
    handle.setPointerCapture(event.pointerId)
    const horizontal = direction === 'horizontal'
    const groupSize = horizontal ? group.clientWidth : group.clientHeight
    if (!groupSize) return
    const startPos = horizontal ? event.clientX : event.clientY
    const prevGrow = parseFloat(getComputedStyle(prev).flexGrow || '1')
    const nextGrow = parseFloat(getComputedStyle(next).flexGrow || '1')
    const total = prevGrow + nextGrow || 1

    const onMove = (e: PointerEvent) => {
      const delta = ((horizontal ? e.clientX : e.clientY) - startPos) / groupSize
      const prevFlex = Math.max(0, prevGrow + delta * total)
      const nextFlex = Math.max(0, nextGrow - delta * total)
      prev.style.flex = `${prevFlex} 1 0%`
      next.style.flex = `${nextFlex} 1 0%`
    }
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      handle.removeEventListener('pointercancel', onUp)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
    handle.addEventListener('pointercancel', onUp)
  }

  return (
    <div
      role="separator"
      data-slot="resizable-handle"
      aria-orientation={context?.direction() === 'vertical' ? 'horizontal' : 'vertical'}
      data-orientation={context?.direction() ?? 'horizontal'}
      class={cn(
        'relative flex w-px touch-none items-center justify-center bg-border ring-offset-background select-none after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden data-[orientation=vertical]:h-px data-[orientation=vertical]:w-full data-[orientation=vertical]:after:inset-x-0 data-[orientation=vertical]:after:inset-y-auto data-[orientation=vertical]:after:top-1/2 data-[orientation=vertical]:after:left-0 data-[orientation=vertical]:after:h-1 data-[orientation=vertical]:after:w-full data-[orientation=vertical]:after:-translate-y-1/2 data-[orientation=vertical]:after:translate-x-0 [&[data-orientation=vertical]>div]:rotate-90',
        local.disabled && 'pointer-events-none',
        local.class
      )}
      onPointerDown={onPointerDown}
      {...rest}
    >
      {local.withHandle && <div class="z-10 flex h-6 w-1 shrink-0 rounded-lg bg-border" />}
    </div>
  )
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup }

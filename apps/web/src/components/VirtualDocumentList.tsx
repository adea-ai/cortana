import { FileText } from 'lucide-solid'
import {
  createComputed,
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  type JSX,
} from 'solid-js'

import { cn } from '@/lib/utils'

import type { BrainDocumentSummary } from '../types'
import { virtualRange } from '../virtualization'
import { Button } from './shadcn/button'

const ROW_HEIGHT = 32

export function VirtualDocumentList(props: {
  documents: BrainDocumentSummary[]
  selectedDocument: string
  loading: boolean
  hasMore: boolean
  onSelect: (id: string) => void
  onPrefetch?: (id: string) => void
  onLoadMore: () => void
}) {
  let viewportRef: HTMLDivElement | undefined
  let loadRequested = false
  let pendingScrollTop = 0
  let scrollFrame: number | null = null
  let prefetchTimer: number | null = null
  const [scrollTop, setScrollTop] = createSignal(0)
  const [viewportHeight, setViewportHeight] = createSignal(240)
  const selectedIndex = () =>
    Math.max(
      0,
      props.documents.findIndex((document) => document.id === props.selectedDocument)
    )
  const [activeIndex, setActiveIndex] = createSignal(0)

  const range = createMemo(() =>
    virtualRange(props.documents.length, scrollTop(), viewportHeight(), ROW_HEIGHT)
  )

  // Keep the keyboard cursor aligned with the external selection.
  createComputed(() => setActiveIndex(selectedIndex()))

  onMount(() => {
    const observer = new ResizeObserver(([entry]) => setViewportHeight(entry.contentRect.height))
    observer.observe(viewportRef!)
    onCleanup(() => {
      observer.disconnect()
      if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame)
      if (prefetchTimer !== null) window.clearTimeout(prefetchTimer)
    })
  })

  // Hover is a weaker open-intent signal than a click or arrow key, so the
  // detail prefetch waits out a fast mouse sweep instead of fetching every
  // row the pointer crosses.
  function scheduleHoverPrefetch(id: string) {
    if (prefetchTimer !== null) window.clearTimeout(prefetchTimer)
    prefetchTimer = window.setTimeout(() => {
      prefetchTimer = null
      props.onPrefetch?.(id)
    }, 90)
  }

  createEffect(() => {
    if (!props.loading) loadRequested = false
  })

  function focusIndex(index: number) {
    if (!props.documents.length) return
    const next = Math.max(0, Math.min(props.documents.length - 1, index))
    setActiveIndex(next)
    // Keyboard focus is a strong open intent — warm the detail cache so the
    // Enter press paints immediately.
    props.onPrefetch?.(props.documents[next].id)
    const viewport = viewportRef!
    if (!viewport) return
    const top = next * ROW_HEIGHT
    if (top < viewport.scrollTop) viewport.scrollTop = top
    else if (top + ROW_HEIGHT > viewport.scrollTop + viewport.clientHeight) {
      viewport.scrollTop = top + ROW_HEIGHT - viewport.clientHeight
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (!props.documents.length) return
    if (event.key === 'ArrowDown') focusIndex(activeIndex() + 1)
    else if (event.key === 'ArrowUp') focusIndex(activeIndex() - 1)
    else if (event.key === 'Home') focusIndex(0)
    else if (event.key === 'End') focusIndex(props.documents.length - 1)
    else if (event.key === 'Enter') props.onSelect(props.documents[activeIndex()].id)
    else return
    event.preventDefault()
  }

  return (
    <div
      ref={(el) => (viewportRef = el)}
      class="virtual-document-list"
      role="listbox"
      aria-label="Documents"
      aria-busy={props.loading}
      aria-activedescendant={
        props.documents[activeIndex()]
          ? `document-option-${props.documents[activeIndex()].id}`
          : undefined
      }
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onScroll={(event) => {
        const viewport = event.currentTarget
        // Trackpad and touch scrolling can fire at 120Hz+; coalesce each
        // burst into one reactive range recompute per frame.
        pendingScrollTop = viewport.scrollTop
        if (scrollFrame === null) {
          scrollFrame = window.requestAnimationFrame(() => {
            scrollFrame = null
            setScrollTop(pendingScrollTop)
          })
        }
        if (
          props.hasMore &&
          !props.loading &&
          !loadRequested &&
          viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - ROW_HEIGHT * 4
        ) {
          loadRequested = true
          props.onLoadMore()
        }
      }}
    >
      <div
        class="virtual-document-space"
        style={{ '--virtual-total-height': `${range().totalHeight}px` } as JSX.CSSProperties}
      >
        <div
          class="virtual-document-window"
          style={{ '--virtual-offset': `${range().offsetTop}px` } as JSX.CSSProperties}
        >
          <For each={props.documents.slice(range().start, range().end)}>
            {(document, offset) => {
              const index = () => range().start + offset()
              return (
                <Button
                  id={`document-option-${document.id}`}
                  role="option"
                  tabIndex={-1}
                  aria-selected={props.selectedDocument === document.id}
                  class={cn(
                    'document-node',
                    props.selectedDocument === document.id && 'selected-document',
                    activeIndex() === index() && 'keyboard-active'
                  )}
                  style={{ '--virtual-row-height': `${ROW_HEIGHT}px` } as JSX.CSSProperties}
                  onMouseEnter={() => {
                    setActiveIndex(index())
                    scheduleHoverPrefetch(document.id)
                  }}
                  onFocus={() => setActiveIndex(index())}
                  onClick={() => props.onSelect(document.id)}
                  title={`${document.title} · ${document.source}`}
                  variant="ghost"
                  size="sm"
                  data-m7-document-row=""
                >
                  <FileText size={14} />
                  <span>{document.title}</span>
                  <small>{document.source}</small>
                </Button>
              )
            }}
          </For>
        </div>
      </div>
    </div>
  )
}

import { VirtualWindow } from '@adea-ai/ui/components/layout/virtual-window'
import { FileText } from 'lucide-solid'
import {
  createComputed,
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
} from 'solid-js'

import type { BrainDocumentSummary } from '../types'
import { virtualRange } from '../virtualization'
import { ListRow } from '@adea-ai/ui/components/composites/list-row'
import { ScrollArea } from '@adea-ai/ui/components/ui/scroll-area'

const DEFAULT_ROW_HEIGHT = 28

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
  let rowRef: HTMLButtonElement | undefined
  let rowObserver: ResizeObserver | undefined
  const [rowHeight, setRowHeight] = createSignal(DEFAULT_ROW_HEIGHT)
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
  const [keyboardFocused, setKeyboardFocused] = createSignal(false)
  const [activeIndex, setActiveIndex] = createSignal(0)

  const range = createMemo(() =>
    virtualRange(props.documents.length, scrollTop(), viewportHeight(), rowHeight())
  )

  // Keep the keyboard cursor aligned with the external selection.
  createComputed(() => setActiveIndex(selectedIndex()))

  function measureRow() {
    const height = rowRef?.getBoundingClientRect().height
    if (height && height > 0) setRowHeight(height)
  }

  onMount(() => {
    const observer = new ResizeObserver(([entry]) => setViewportHeight(entry.contentRect.height))
    observer.observe(viewportRef!)
    rowObserver = new ResizeObserver(measureRow)
    if (rowRef) rowObserver.observe(rowRef)
    measureRow()
    onCleanup(() => {
      observer.disconnect()
      rowObserver?.disconnect()
      rowRef = undefined
      rowObserver = undefined
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
    const top = next * rowHeight()
    if (top < viewport.scrollTop) viewport.scrollTop = top
    else if (top + rowHeight() > viewport.scrollTop + viewport.clientHeight) {
      viewport.scrollTop = top + rowHeight() - viewport.clientHeight
    }
    // Keyboard navigation must mount the active option in the same update;
    // waiting for a scroll event leaves aria-activedescendant pointing away
    // from the rendered window until the next animation frame.
    setScrollTop(viewport.scrollTop)
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
    <ScrollArea
      ref={(el) => (viewportRef = el)}
      orientation="both"
      class="min-h-25 flex-1"
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
      onFocus={() => setKeyboardFocused(true)}
      onBlur={() => setKeyboardFocused(false)}
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
          viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - rowHeight() * 4
        ) {
          loadRequested = true
          props.onLoadMore()
        }
      }}
    >
      <VirtualWindow totalSize={range().totalHeight} offset={range().offsetTop}>
        <For each={props.documents.slice(range().start, range().end)}>
          {(document, offset) => {
            const index = () => range().start + offset()
            return (
              <ListRow
                as="button"
                type="button"
                ref={(el: HTMLButtonElement) => {
                  rowRef = el
                  rowObserver?.disconnect()
                  rowObserver?.observe(el)
                  // Refs run before the row is attached and attributes are applied.
                  queueMicrotask(measureRow)
                }}
                id={`document-option-${document.id}`}
                role="option"
                tabIndex={-1}
                aria-selected={props.selectedDocument === document.id}
                selected={
                  keyboardFocused()
                    ? activeIndex() === index()
                    : props.selectedDocument === document.id
                }
                aria-current={props.selectedDocument === document.id ? 'true' : undefined}
                dense
                leading={<FileText aria-hidden="true" />}
                trailing={<span class="max-w-16 truncate text-xs">{document.source}</span>}
                class="w-full text-left"
                onMouseEnter={() => {
                  setActiveIndex(index())
                  scheduleHoverPrefetch(document.id)
                }}
                onFocus={() => setActiveIndex(index())}
                onClick={() => props.onSelect(document.id)}
                tooltip={`Open ${document.title} from ${document.source}`}
                data-m7-document-row=""
              >
                {document.title}
              </ListRow>
            )
          }}
        </For>
      </VirtualWindow>
    </ScrollArea>
  )
}

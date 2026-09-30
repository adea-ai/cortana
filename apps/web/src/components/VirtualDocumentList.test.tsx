import { createSignal } from 'solid-js'
import { afterEach, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen, waitFor } from 'solid-testing-library'
import { VirtualDocumentList } from './VirtualDocumentList'
import { firstDocumentsPage } from '../test/fixtures'

afterEach(cleanup)

test('keyboard navigation visibly follows the active option without committing selection', () => {
  const documents = firstDocumentsPage.documents.slice(0, 2)
  expect(documents).toHaveLength(2)
  let opened = ''
  render(() => (
    <VirtualDocumentList
      documents={documents}
      selectedDocument={documents[0].id}
      loading={false}
      hasMore={false}
      onSelect={(id) => {
        opened = id
      }}
      onLoadMore={() => {}}
    />
  ))
  const list = screen.getByRole('listbox', { name: 'Documents' })
  list.focus()
  fireEvent.keyDown(list, { key: 'ArrowDown' })
  const options = screen.getAllByRole('option')
  expect(list.getAttribute('aria-activedescendant')).toBe(options[1].id)
  expect(options[1].hasAttribute('data-selected')).toBe(true)
  expect(options[0].hasAttribute('data-selected')).toBe(false)
  expect(options[0].getAttribute('aria-selected')).toBe('true')
  expect(options[1].getAttribute('aria-selected')).toBe('false')
  expect(opened).toBe('')
  fireEvent.keyDown(list, { key: 'Enter' })
  expect(opened).toBe(documents[1].id)
})

test('rows loaded after mount are measured and observed before virtualizing their height', async () => {
  const originalBounds = HTMLElement.prototype.getBoundingClientRect
  const originalObserve = ResizeObserver.prototype.observe
  const observedRows: Element[] = []
  HTMLElement.prototype.getBoundingClientRect = function () {
    return this.hasAttribute('data-m7-document-row')
      ? new DOMRect(0, 0, 200, 48)
      : originalBounds.call(this)
  }
  ResizeObserver.prototype.observe = function (element, options) {
    observedRows.push(element)
    return originalObserve.call(this, element, options)
  }
  try {
    const [documents, setDocuments] = createSignal<typeof firstDocumentsPage.documents>([])
    render(() => (
      <VirtualDocumentList
        documents={documents()}
        selectedDocument=""
        loading={false}
        hasMore={false}
        onSelect={() => {}}
        onLoadMore={() => {}}
      />
    ))
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    setDocuments(
      Array.from({ length: 100 }, (_, index) => ({
        ...firstDocumentsPage.documents[0],
        id: `loaded-${index}`,
      }))
    )
    await waitFor(() =>
      expect(
        observedRows.filter((element) => element.hasAttribute('data-m7-document-row')).length
      ).toBeGreaterThan(0)
    )
    await waitFor(() =>
      expect(
        document.querySelector<HTMLElement>('[data-slot="virtual-window-space"]')?.style.height
      ).toBe('4800px')
    )
    expect(screen.getAllByRole('option').length).toBeLessThan(100)
  } finally {
    cleanup()
    HTMLElement.prototype.getBoundingClientRect = originalBounds
    ResizeObserver.prototype.observe = originalObserve
  }
})

test('End and Home keep the active option mounted in a large virtualized list', () => {
  const documents = Array.from({ length: 100 }, (_, index) => ({
    ...firstDocumentsPage.documents[0],
    id: `keyboard-${index}`,
  }))
  render(() => (
    <VirtualDocumentList
      documents={documents}
      selectedDocument=""
      loading={false}
      hasMore={false}
      onSelect={() => {}}
      onLoadMore={() => {}}
    />
  ))
  const list = screen.getByRole('listbox', { name: 'Documents' })
  list.focus()
  for (const key of ['End', 'Home']) {
    fireEvent.keyDown(list, { key })
    const activeId = list.getAttribute('aria-activedescendant')
    expect(activeId).not.toBeNull()
    expect(document.getElementById(activeId!)).not.toBeNull()
    expect(document.getElementById(activeId!)?.getAttribute('role')).toBe('option')
  }
})
